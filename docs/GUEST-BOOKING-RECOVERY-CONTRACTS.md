# Hợp đồng kỹ thuật Guest Booking Recovery

Mốc thiết kế: 2026-10-29, contract v2.4. Trạng thái LOCAL_VALIDATED/NOT_RUN trong các bảng là snapshot tại mốc thiết kế, không phải kết quả kiểm chứng revision hiện tại. Endpoint và wiring hiện hành xem [API](API.md), [Backend architecture](BACKEND-ARCHITECTURE.md) và source; cần evidence mới để kết luận runtime.

Đầu vào:

- Contract guest checkout v2.4 và các quyết định F1–F6 được ghi lại đầy đủ bên dưới.
- Source hiện hành trong [Payments](../backend/src/modules/payments/) và [schema](../backend/prisma/schema.prisma).

Hồ sơ plan/concept/review nội bộ không được publish; tài liệu public không phụ thuộc liên kết local.

Tài liệu này chốt ba điểm còn mở của review v2.4 và các contract F1–F6 ở mức đủ để viết code Bước 2–5. Nó **không** thay phê duyệt của user và không chứng minh endpoint/worker đã chạy.

## 1. Quyết định đã chốt

| Mã  | Vấn đề                          | Quyết định                                                                                                                                                                                                     |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Tuần tự hóa fingerprint         | Dùng canonical UTF-8 **có length-prefix cho mọi field**, version `v1`, hash SHA-256. Không dùng JSON tự do, không nối chuỗi thiếu ranh giới.                                                                   |
| D2  | `canPay` khi `CREATING`         | `canPay = canCreatePayment OR canShowQr`. CREATING cho phép khôi phục/replay cùng idempotency key nhưng không hiển thị QR. PENDING thiếu payload cũng không được coi là trả được.                              |
| D3  | Email khi một SĐT gắn nhiều đơn | Chỉ gửi cho đơn `HOLDING` còn hạn; tối đa **5 recipient/lần**, **8 email/SĐT/15 phút**, **1 email/recipient/60 phút**; dedupe theo email chuẩn hóa; luôn trả thông báo generic. Không trả danh sách đơn/email. |

## 2. F1 — DB Generation Fencing & Reconcile

**PostgreSQL là authority. Redis không phải bằng chứng rollback.**

- Bảng `guest_otp_proofs` giữ proof OTP một lần: `status ACTIVE|CONSUMED|EXPIRED`, `fencing_generation BIGINT`, `expires_at`.
- Bảng `guest_checkout_intents` giữ intent đã commit: `checkout_intent_id` (PK), `booking_id` **UNIQUE**, `otp_proof_id` **UNIQUE + NOT NULL**, `payload_fingerprint`, `recovery_secret_hash`, `fencing_generation`, `status`. Invariant: mọi intent guest checkout đều sinh từ một proof đã xác thực; không có intent "không OTP".
- Thứ tự xử lý (Bước 2):
  1. Đọc intent theo `checkoutIntentId`. Nếu có → xác thực `recoverySecret` rồi trả snapshot cũ; **không** kiểm tra hạn proof (replay không phụ thuộc proof còn hạn).
  2. Chưa có intent → kiểm tra sơ bộ proof `ACTIVE`, còn hạn, đúng email. Đây chỉ là fast-fail; **không** phải điều kiện quyết định.
  3. Mở transaction; lấy `pg_advisory_xact_lock(hashtext('guest-checkout-intent'), hashtext(checkoutIntentId))`.
  4. Consume proof bằng một câu UPDATE nguyên tử, kiểm cả hạn và binding tại thời điểm ghi (sau khi đã có khóa):
     ```sql
     UPDATE guest_otp_proofs
     SET status = 'CONSUMED',
         consumed_at = clock_timestamp(),
         fencing_generation = fencing_generation + 1
     WHERE id = $proofId
       AND status = 'ACTIVE'
       AND expires_at > clock_timestamp()
       AND email = $normalizedEmail
       AND purpose = 'GUEST_HOLD_CREATE'
     RETURNING fencing_generation;
     ```
     Dùng `clock_timestamp()` (không phải `now()`/`transaction_timestamp()`) để hạn proof được đánh giá tại thời điểm cập nhật, không phải lúc mở transaction. Vì vậy request chờ khóa qua mốc hết hạn sẽ trả 0 row.
  5. 0 row → phân giải theo thứ tự: (a) đọc intent theo `checkoutIntentId`; nếu có, xác thực secret rồi trả snapshot (request khác đã thắng); (b) không có intent → đọc proof: `status='CONSUMED'` là bất biến bị vi phạm (báo reconcile, không tạo hold); `expires_at <= now` → `PROOF_EXPIRED`; email/purpose không khớp → từ chối generic. Không nhánh nào được tạo hold.
  6. `INSERT guest_checkout_intents` cùng transaction, kèm generation vừa trả.
  7. Commit.
- Vì sao stale worker không ghi đè: (a) advisory lock giữ đến hết transaction, nên attempt mới chỉ chạy sau khi transaction cũ kết thúc (commit/rollback); (b) proof conditional update chỉ thắng một lần **và** tự kiểm hạn/binding; (c) `UNIQUE(booking_id)` và `UNIQUE(otp_proof_id)` chặn hai intent. `fencing_generation` là số đối soát, không phải khóa.
- Timeout/mất kết nối: transaction PostgreSQL tự rollback hoặc commit nguyên tử. Worker reconcile chỉ được: có intent → đánh dấu proof `CONSUMED`; không có intent **và** đã chứng minh transaction cũ đóng (advisory lock lấy được) → trả proof `ACTIVE` nếu còn hạn. Cấm reset mù theo TTL Redis.
- Reconcile job quét proof `CONSUMED` thiếu intent / intent `COMMITTED` thiếu booking để báo bất biến (không tự sửa dữ liệu tài chính).

Test bắt buộc ở Bước 2: giữ transaction cũ qua lease; retry cùng proof; hai worker đồng thời; mất response sau commit; unique conflict; Redis restart không đổi kết quả. Ngoài ra: hai kết nối DB, connection A giữ advisory lock qua mốc `expires_at`, connection B chạy câu UPDATE trên và phải nhận **0 row** (AC-R3); case sai email cũng 0 row; proof vẫn `ACTIVE` sau khi hết hạn (không bị consume).

## 3. F2 — Token Capability Matrix

| Token                   | Header                     | Quyền                                                       | Hiệu lực                                                                                                                    |
| ----------------------- | -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `CheckoutRecoveryToken` | `X-Booking-Checkout-Token` | `READ_HOLD_RECOVERY`, `CREATE_PREPAYMENT`, `CANCEL_HOLD`    | Cố định **10 phút từ hold gốc**; mutation chỉ khi `serverNow < holdExpiresAt` (5 phút); phút 5–10 chỉ đọc terminal summary. |
| `ManageToken`           | `X-Booking-Access-Token`   | `READ_BOOKING_MANAGE`, `REQUEST_PAID_CANCEL`, `VIEW_REFUND` | `startsAt + 30 ngày`.                                                                                                       |

- Expiry token được **tính từ `holdIssuedAt`**, không nhận TTL từ request và không gia hạn khi replay/resume.
- `purpose` mới `CHECKOUT_RECOVERY` trong `booking_token_purpose`; token checkout **không** được dùng cho refund/manage (AC-17, AC-18).
- Code: `backend/src/modules/payments/domain/guest-checkout-token-policy.ts`.

## 4. F3 — Canonical Fingerprint `v1`

Định dạng chính xác (UTF-8, nối bằng `\n`, không có newline cuối):

```text
booking.guest-hold.fingerprint.v1
courtId:<byteLen>:<uuid lowercase>
startsAt:<byteLen>:<ISO-8601 UTC Z>
endsAt:<byteLen>:<ISO-8601 UTC Z>
email:<byteLen>:<lowercase trimmed>
name:<byteLen>:<NFC trimmed, gộp whitespace>
phone:<byteLen>:<chuỗi số, giữ số 0 đầu và dấu + đầu>
termsVersion:<byteLen>:<trimmed>
```

- `byteLen` là `Buffer.byteLength(value, 'utf8')`, áp dụng cho **mọi** field.
- Thời gian bắt buộc có timezone tường minh (`Z` hoặc `±HH:MM`); server canonical hóa về UTC. Chuỗi không có timezone bị từ chối để tránh phụ thuộc TZ server.
- **Calendar strict**: kiểm năm/tháng/ngày trên chính phần ngày đã ghi (theo offset) trước khi gọi `Date`; ngày không tồn tại (`2026-02-30`, `2026-04-31`, `2026-02-29`) bị từ chối với `INVALID_CALENDAR_DATE` thay vì bị cuộn sang ngày khác. Giờ/phút/giây và offset ngoài miền hợp lệ → `INVALID_INSTANT`. Điều này không đổi digest của input hợp lệ nên vector `v1` giữ nguyên.
- `phone` là định danh chuỗi: bỏ khoảng trắng/`.()-`, giữ `+` đầu và số 0 đầu; không chuyển sang number.
- Version lưu ở `guest_checkout_intents.fingerprint_version`; đổi thuật toán phải tạo version mới, không ghi đè vector cũ.
- Vector fixture: digest `6a6517b2ca10a88307f2e91c322ae5027c761de0733fb779d050ffdab9243c8c` (test `guest-checkout-fingerprint.spec.ts`).
- Code: `backend/src/modules/payments/domain/guest-checkout-fingerprint.ts`.

## 5. F4 — Recovery DTO & Action Matrix

`GuestHoldRecoveryResponse` giữ schema Plan v2.4 và bổ sung `allowedActions.canCreatePayment`, `canShowQr`, `canReadRecovery` để UI không phải suy luận từ enum.

| Booking                          | Payment                     | canCreatePayment | canShowQr | canCancelHold | canPay    |
| -------------------------------- | --------------------------- | ---------------- | --------- | ------------- | --------- |
| HOLDING, còn hạn                 | `null`                      | true             | false     | true          | true      |
| HOLDING, còn hạn                 | `CREATING`                  | true (reconcile) | false     | true          | true      |
| HOLDING, còn hạn                 | `PENDING` không payload     | false            | false     | true          | **false** |
| HOLDING, còn hạn                 | `PENDING` có payload        | false            | true      | true          | true      |
| HOLDING, còn hạn                 | `PARTIALLY_PAID` có payload | false            | true      | false         | true      |
| HOLDING, còn hạn                 | `FAILED`                    | true (retry)     | false     | true          | true      |
| HOLDING, còn hạn                 | `CANCELLED` / `EXPIRED`     | false            | false     | true          | false     |
| HOLDING, còn hạn                 | `PAID`                      | false            | false     | false         | false     |
| HOLDING, hết hạn / token hết hạn | bất kỳ                      | false            | false     | false         | false     |
| CONFIRMED/CANCELLED/EXPIRED      | bất kỳ                      | false            | false     | false         | false     |
| Bất kỳ                           | `requiresReview = true`     | false            | false     | false         | false     |

- `canPay` chỉ là tổng hợp UI; **không** đồng nghĩa QR đã sẵn sàng. UI phải đọc `canShowQr` trước khi render QR và hiển thị loading khi `CREATING`.
- `CANCELLED`/`EXPIRED` payment request không tự sinh request mới (OPEN-2); cần chính sách provider/reconcile ở Bước 3.
- Code: `backend/src/modules/payments/domain/guest-hold-actions.ts`.

## 6. F5 — Durable Payment Intent

- Phase 1 (DB transaction, cùng hold): tạo `PaymentRequest` `status=CREATING`, `idempotency_key=pay_guest_{bookingId}` + `OutboxMessage`, commit.
- Phase 2 (ngoài transaction): gọi PayOS/VietQR.
- Phase 3 (transaction mới): chỉ `UPDATE ... WHERE id=? AND status='CREATING'` sang `PENDING` kèm payload; thua race thì đọc lại, không ghi đè.
- `CREATING` khi recovery: kiểm tra provider hoặc gọi lại cùng order/idempotency key; không tạo request thứ hai.
- **OPEN-1:** chưa có bằng chứng provider dedup theo `pay_guest_{bookingId}`. Bước 3 phải đối chiếu adapter + tài liệu/provider sandbox (stable order identifier, tra cứu, retry). Nếu provider không bảo đảm, giữ `CREATING`/`UNKNOWN` và reconcile, tuyệt đối không sinh lệnh mới.
- Khóa hai chiều Cancel/Webhook/Expiry dùng chung `SELECT ... FOR UPDATE` trên `bookings` (Bước 2–3), map `ALREADY_PAID` 409 và `SCR06_REVIEW` khi cancel thắng.

## 7. F6 — Outbox & Tra Cứu

- `outbox_messages` lưu `payload_ciphertext`, `iv` (12 bytes), `auth_tag` (16 bytes), `key_version`, `deduplication_key UNIQUE`, `expires_at`, `status`, `attempt_count`, `next_retry_at`, `purged_at`.
- Ghi outbox **trong cùng transaction** tạo hold. Worker chỉ gửi khi `serverNow < holdExpiresAt`; quá hạn → `EXPIRED_SKIPPED`. SMTP accept nhưng crash trước khi ghi `SENT` ⇒ **at-least-once**, lần gửi lại dùng cùng template/link, không tạo hold/gia hạn.
- **Retention (đã chốt): tombstone zero-length, giữ row.** Sau 24 giờ kể từ `expiresAt` và khi status đã terminal (`SENT`/`FAILED`/`EXPIRED_SKIPPED`), job purge chạy một UPDATE: `SET payload_ciphertext=''::bytea, iv=''::bytea, auth_tag=''::bytea, purged_at=clock_timestamp()` với điều kiện `purged_at IS NULL`.
  - `status` **không** đổi: giữ kết quả giao nhận cuối để audit; `purged_at` là dấu tombstone.
  - `aggregate_type`, `aggregate_id`, `event_type`, `deduplication_key`, `attempt_count`, `created_at`, `sent_at`, `expires_at` được giữ. Row tồn tại vĩnh viễn ở dạng tombstone (không xóa row) để audit và chống gửi lại.
  - `deduplication_key` vẫn UNIQUE sau purge: một job trùng/retry muộn bị chặn ở insert.
  - Worker đọc row có `purged_at IS NOT NULL` phải coi là terminal, **không** giải mã, **không** gửi lại, không tạo job mới; ghi nhận `skipped_purged` và không đổi `status`.
  - Purge chỉ áp cho row quá hạn lưu trữ; row còn `QUEUED`/`SENDING` quá deadline phải được worker chuyển terminal trước, sau đó mới purge ở vòng kế tiếp.
  - Invariant DB: `CHECK` bắt buộc `purged_at IS NULL` ⇔ ciphertext > 0, iv = 12 byte, tag = 16 byte; `purged_at IS NOT NULL` ⇔ cả ba zero-length. Không thể purge nửa vời.
- Fan-out tra cứu: xem D3; code `backend/src/modules/payments/domain/guest-lookup-fanout-policy.ts`. Rate limit IP/email vẫn ở tầng HTTP (Bước 5) và dùng quota đọc từ Redis/DB; policy thuần chỉ quyết định recipient.
  - `planGuestLookupFanout` trả `recipients: { email, bookingIds[] }[]`: dedupe theo **email + bookingId** (một đơn không bị mất khi cùng email có nhiều hold), giữ toàn bộ `bookingIds` còn hạn của mỗi email, sắp xếp deterministic.
  - Quota áp theo email recipient (một email chứa nhiều link vẫn tính một lần gửi); `bookingIds` chỉ dùng nội bộ để dựng nội dung email, không xuất hiện trong response public (`buildGuestLookupPublicResponse` luôn generic).

## 8. Persistence đã thêm

Migration:

- `backend/prisma/migrations/20261029000000_guest_checkout_recovery_contracts/migration.sql`
- `backend/prisma/migrations/20261029010000_guest_checkout_recovery_remediation/migration.sql` (remediation 2026-10-29)

| Object                                    | Ghi chú                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `guest_otp_proofs`                        | proof OTP một lần + generation                                              |
| `guest_checkout_intents`                  | UNIQUE `booking_id`, UNIQUE + **NOT NULL** `otp_proof_id`, FK booking/proof |
| `outbox_messages`                         | ciphertext/iv/auth_tag/key_version + dedup UNIQUE + `purged_at` tombstone   |
| `booking_token_purpose.CHECKOUT_RECOVERY` | purpose token checkout                                                      |

- `outbox_messages_payload_shape_check` buộc tương đương hai chiều giữa `purged_at` và độ dài ciphertext/iv/tag (xem F6).
- `guest_checkout_intents.otp_proof_id NOT NULL`: không tồn tại intent guest checkout không gắn proof. Nếu tương lai cần intent không OTP (ví dụ member flow), phải tạo bảng/loại intent riêng, không nới cột này.

Đã apply trên PostgreSQL test (cổng 5435) và kiểm constraint/enum; **chưa** apply DB ứng dụng/production.

## 9A. Bản sửa đổi 2026-10-29 (remediation review Bước 1)

| Mã     | Finding gốc                          | Thay đổi                                                                                                                   |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| FIX-R1 | Proof consume thiếu kiểm hạn/binding | F1 dùng UPDATE nguyên tử có `expires_at > clock_timestamp()`, `email`, `purpose`; quy trình 0-row; `otp_proof_id NOT NULL` |
| FIX-R2 | Fan-out mất liên kết email–booking   | `GuestLookupRecipientGroup { email, bookingIds[] }`; dedupe theo cặp email+booking; public response vẫn generic            |
| FIX-R3 | Ngày không tồn tại bị cuộn           | Calendar strict trước `Date`; mã lỗi `INVALID_CALENDAR_DATE`; test 30/02, 31/04, 29/02, offset                             |
| FIX-R4 | Chưa chốt purge ciphertext outbox    | Tombstone zero-length + `purged_at`, giữ row/status/dedup/audit; DB CHECK bắt buộc nhất quán; retry sau purge là terminal  |

Test tương ứng: `guest-checkout-fingerprint.spec.ts`, `guest-lookup-fanout-policy.spec.ts` và integration test DB `backend/test/guest-checkout-recovery.integration.spec.ts` (hai connection cho AC-R3, purge/CHECK cho AC-R4).

## 9. Snapshot acceptance tại mốc thiết kế

| AC                                    | Bước triển khai | Trạng thái hiện tại              |
| ------------------------------------- | --------------- | -------------------------------- |
| AC-01..07 (OTP/proof/replay/fencing)  | 2               | NOT_RUN (mới có contract/schema) |
| AC-08..09 (QR thật/CREATING)          | 3               | NOT_RUN (policy xong)            |
| AC-10..13 (cancel/race)               | 2–3             | NOT_RUN                          |
| AC-14..19 (recovery/token/fragment)   | 2–5             | NOT_RUN                          |
| AC-20..21 (outbox deadline)           | 5               | NOT_RUN                          |
| AC-22 (lookup)                        | 5               | NOT_RUN (policy xong)            |
| AC-23..25 (auth unknown/modal/member) | 4               | NOT_RUN                          |

## 10. Điểm mở

- **OPEN-1**: contract dedup/retry của PayOS cần xác minh bằng tài liệu + sandbox ở Bước 3.
- **OPEN-2**: chính sách tái tạo payment request khi request cũ `CANCELLED`/`EXPIRED` nhưng booking còn `HOLDING`.
- **OPEN-3**: reconcile chứng minh transaction cũ đã đóng bằng advisory lock; cần integration test với hai connection thật trước khi coi F1 hoàn tất.
- **OPEN-4**: nơi lưu proof/OTP challenge (Redis TTL 5 phút vs bảng DB). Contract F1 đã chuyển authority sang DB; nếu giữ Redis cache phải chứng minh không mất tính đơn điệu khi restart.
