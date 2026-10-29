# Booking MVP: giữ chỗ 5 phút & Khách vãng lai (Guest Booking)

Next.js gọi NestJS qua cookie session và CSRF (đối với hội viên) hoặc API public có rate limit và xác thực OTP (đối với khách vãng lai); NestJS dùng Prisma transaction trên PostgreSQL. Booking không dùng Redis lock: PostgreSQL transaction và exclusion constraint là lớp bảo vệ chính. BullMQ chạy worker dọn hold hết hạn trong tiến trình API; Redis cũng phục vụ session revocation, CSRF, auth và guest throttling. Hệ thống hỗ trợ đặt cọc bắt buộc 30%, hủy trước 12h (hoàn 20%, phí 10%), và hủy trong vòng 12h/No-show (mất cọc 30%).

## Contract HTTP

Response thành công là `{ success: true, data }`. Lỗi dùng `{ statusCode, message, error? }` của Nest. Các route private có `Cache-Control: no-store, private`.

| Route                                                      | Input / kết quả                                                                                                                                                                                                                                                                                  | Quyền      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `GET /api/courts`                                          | Danh sách sân và chi nhánh ACTIVE. `pricePerHour` là giá thấp nhất áp dụng trong giờ mở cửa hôm nay theo timezone chi nhánh; `0` nghĩa chưa có giá hôm nay. Danh sách rỗng trả `[]`; DB lỗi không trả fixture.                                                                                   | Public     |
| `GET /api/courts/:id`                                      | Một sân ACTIVE, `timezone`, `branchName`, `address`, `cleanupMinutes`; sân/chi nhánh tắt trả 404. Ảnh và mô tả loại sân là trình bày minh họa theo loại sân.                                                                                                                                     | Public     |
| `GET /api/courts/:id/availability?startsAt=...&endsAt=...` | Kiểm tra một khoảng phút linh hoạt. Trả `available`, `reason`, `serverNow`, `timezone`, `cleanupMinutes`, `occupiedUntil`, `totalAmount`, `currency`, `priceItems`. `available=false` khi vướng occupancy/buffer hoặc quá sát giờ; ngoài giờ/thiếu giá trả 400. Endpoint chỉ đọc, không chuyển trạng thái hay release occupancy; hold quá hạn được coi là không chặn lịch. | Public     |
| `POST /api/bookings`                                       | Body tạo giữ chỗ hội viên (yêu cầu đăng nhập). 201 cho cả tạo mới và replay; replay trả trạng thái hiện tại. Đặt cọc 30% (`prepaymentPercent = 30`).                                                                                                                                            | JWT + CSRF |
| `GET /api/bookings/me?cursor=<UUID>`                       | Tối đa 50 booking của tài khoản, mới nhất trước; response thêm `nextCursor` hoặc null. Không có endpoint đọc booking người khác.                                                                                                                                                                 | JWT        |
| `PATCH /api/bookings/:id/cancel`                           | 200 trả booking hiện tại sau hủy; repeat trên CANCELLED/EXPIRED giữ nguyên. Hủy trước 12h hoàn 20%, giữ 10%; trong 12h mất cọc 30%. Sai owner/không tồn tại trả 404, trạng thái khác HOLDING/chưa đủ điều kiện trả 409.                                                                     | JWT + CSRF |
| `POST /api/guest/bookings/send-otp`                        | Gửi mã OTP 6 số ngẫu nhiên về email khách vãng lai. Hạn 5 phút, rate limit 5 req/5 phút. Cho phép resend sau 60s.                                                                                                                                                                                | Public     |
| `POST /api/guest/bookings/verify-otp`                      | Xác thực mã OTP 6 số cho email khách vãng lai. Tối đa 5 lần thử sai, rate limit 10 req/5 phút.                                                                                                                                                                                                   | Public     |
| `POST /api/guest/bookings`                                 | Tạo đơn giữ chỗ HOLDING 5 phút cho khách vãng lai sau khi verify OTP. Yêu cầu `courtId`, `startsAt`, `endsAt`, `customerName`, `customerPhone`, `customerEmail`, `prepaymentPercent: 30`, `idempotencyKey`. Trả token `MANAGE_BOOKING` dùng một lần.                                             | Public     |

```json
{
  "courtId": "10000000-0000-4000-8000-000000000101",
  "startsAt": "2035-01-08T08:00:00+07:00",
  "endsAt": "2035-01-08T09:00:00+07:00",
  "idempotencyKey": "client-generated-uuid",
  "policyAccepted": true
}
```

Datetime bắt buộc có `Z`/offset và chính xác đến phút; khoảng chơi nằm trong cùng ngày địa phương, không qua chuyển đổi DST, giờ chơi nằm trong giờ mở cửa. Bắt đầu ít nhất 5 phút sau DB clock để không vi phạm constraint `hold_expires_at <= starts_at`. Không áp lưới 15 phút. Buffer được cộng sau giờ kết thúc, có thể vượt giờ đóng cửa vì không phải giờ chơi.

Booking response chỉ chứa `id`, `bookingCode`, `courtId`, `courtName`, `timezone`, `startsAt`, `endsAt`, `holdExpiresAt`, `status`, `totalAmount`, `currency`, `priceItems`. Mỗi price item có `startsAt`, `endsAt`, `durationMinutes`, `pricePerHour`, `amount`; không lộ snapshot liên hệ hoặc idempotency key. Tiền JSON là số nguyên VND.

Client lấy token từ `GET /api/auth/csrf`, gửi credentials và `X-CSRF-Token` cho mutation; Origin phải khớp `WEB_ORIGIN`. Khóa idempotency trong **body**, 8–100 ký tự `[A-Za-z0-9_-]`. Unique `(userId, key)` cùng PostgreSQL advisory transaction lock tuần tự hóa retry cùng logical request. Cùng key khác sân/giờ trả 409; cùng payload trả booking gốc, kể cả EXPIRED/CANCELLED. Payload dùng thời điểm chuẩn hóa; thay đổi giá sau đó không tính lại booking cũ. Hai tài khoản có thể dùng cùng key cho hai lượt đặt riêng.

## Transaction, expiry và giá

- Tạo booking, price items, history và occupancy cùng transaction; constraint `court_occupancies_no_active_overlap` bảo vệ `[startsAt, endsAt + cleanupMinutes)` khi ACTIVE. Bắt SQLSTATE `23P01`/tên constraint thành 409; lỗi DB khác trả 503 với thông báo chung, không log query chứa liên hệ khách.
- Availability chỉ đọc: query conflict join `Booking` và coi occupancy của HOLDING có `holdExpiresAt <= DB clock` là không còn hiệu lực, nên không trả lịch bận sai trong lúc chờ worker.
- Worker BullMQ `booking-expiry` chạy định kỳ (mặc định 15 giây, batch 100; cấu hình `BOOKING_EXPIRY_INTERVAL_MS`/`BOOKING_EXPIRY_BATCH_SIZE`) và dùng conditional transition HOLDING → EXPIRED khi `holdExpiresAt <= DB clock`, ghi đúng một history và RELEASED occupancy trong cùng transaction. Scheduler có id cố định nên nhiều instance dùng chung một lịch; job retry 3 lần và transition là idempotent.
- POST trước khi insert, GET booking của tôi và hủy vẫn tự đối soát expiry theo owner/court trong transaction để không phụ thuộc độ trễ worker. Write path và worker cùng conditional update nên không tạo history thứ hai.
- `PriceRule` phải phủ kín khoảng chơi; lọc isActive, weekday ISO 1–7, ngày hiệu lực inclusive theo timezone chi nhánh. Priority lớn thắng; hòa priority chọn UUID nhỏ theo thứ tự ổn định. Gộp đoạn liên tiếp cùng rule rồi làm tròn từng dòng HALF_UP tới 1 VND và cộng tổng bằng Decimal.
- Chính sách cọc và hoàn hủy: Bắt buộc đặt cọc 30% tiền thuê sân (`prepaymentPercent = 30`) cho cả hội viên và khách vãng lai. Hủy trước 12 giờ (`T - 12h`) so với giờ bắt đầu được hoàn 20%, hệ thống giữ lại phí hủy 10%. Hủy trong vòng 12 giờ hoặc vắng mặt (No-show) không được hoàn tiền, mất toàn bộ 30% tiền cọc.
- Khách vãng lai và trải nghiệm an toàn (Guest UX):
  - Form khách vãng lai tự động ẩn khi người dùng đã đăng nhập hội viên.
  - Trước khi tạo đơn giữ chỗ, khách vãng lai phải xác thực email qua mã OTP 6 số (`GuestOtpDialog`).
  - Giao diện thanh toán hiển thị qua Modal QR Code (`BookingQrModal`) có backdrop khóa tương tác bên ngoài, ngăn ngừa click nhầm thay đổi slot hoặc lịch đặt.
  - Hệ thống tự động phát hiện và cảnh báo đơn hàng chưa hoàn tất (`PendingBookingAlert`) để khách tiếp tục thanh toán hoặc chủ động hủy đơn.
- Migration mới chỉ đổi idempotency booking thành khóa ghép; giữ partial unique cho guest hiện có và giữ nguyên exclusion constraint. Không migrate DB ứng dụng tự động.

## Seed và demo

`npm run seed:courts` yêu cầu `DATABASE_URL` tường minh, tạo riêng chi nhánh `MVP-DEMO`, 4 sân UUID ổn định, giờ 06:00–23:00 mỗi ngày và 4 PriceRule. Dữ liệu demo được lưu thật trong DB; script không tạo tài khoản và không ghi đè dữ liệu hiện có, chạy lại không nhân bản. Chỉ chạy vào DB development/test đã chọn. Khi chạy local, có thể dùng `node --env-file=backend/.env node_modules/prisma/build/index.js db seed --config backend/prisma.config.ts` nếu URL nằm trong file đó.

UI `/` → `/courts/<UUID>` → `/bookings`: đăng nhập tài khoản đã verified, kiểm tra khoảng và giá, chấp thuận điều khoản giữ chỗ rồi tạo HOLDING. Booking của tôi cập nhật mỗi 15 giây và khi reconnect; nút tải lại lấy trạng thái server. API lỗi hiển thị lỗi, không thay bằng sân mẫu. Dashboard có nhãn DEMO cho toàn bộ số liệu minh họa. Link chi tiết sân bật mặc định; `NEXT_PUBLIC_COURT_DETAILS_ENABLED=false` có thể tắt entry.

## PostgreSQL integration

Suite `backend/test/booking.integration.spec.ts` dùng HTTP thật với JWT/CSRF/session guards thật, PostgreSQL, Redis và worker BullMQ thật. Chỉ mock gửi mail (suite không gửi mail/đăng ký/charge). Bắt buộc URL riêng `booking_mvp_test` trên loopback; không fallback sang DATABASE_URL ứng dụng. Suite đặt interval scheduler rất lớn và tự đẩy job để kiểm tra worker, nên không phụ thuộc tick định kỳ.

```powershell
# Khởi tạo một lần; không dùng volume dev hoặc cổng dev.
docker run -d --name booking-mvp-postgres-test -p 127.0.0.1:15435:5432 -e POSTGRES_USER=booking_test -e POSTGRES_PASSWORD=disposable_test_only -e POSTGRES_DB=booking_mvp_test postgres:16.11-alpine
docker run -d --name booking-mvp-redis-test -p 127.0.0.1:16381:6379 redis:7.4.11-alpine
$env:BOOKING_DATABASE_TEST_URL='postgresql://booking_test:disposable_test_only@127.0.0.1:15435/booking_mvp_test'
$env:BOOKING_REDIS_TEST_URL='redis://127.0.0.1:16381'
$env:BOOKING_REQUIRE_STORAGE='true'
$env:DATABASE_URL=$env:BOOKING_DATABASE_TEST_URL
$env:TZ='UTC'
npm run prisma:migrate:deploy
npm run prisma:generate
npm run test:booking:integration
```

Đợi `pg_isready` trước migrate. Suite dọn đúng fixture theo UUID; test fault-injection tạo và xóa trigger riêng trong DB test, cần quyền DDL ở DB này. Không chạy song song nhiều bản suite trên cùng DB. `BOOKING_REQUIRE_STORAGE=true` khiến thiếu URL là FAIL; chạy Jest mặc định không tự chạy suite này. CI tạo DB `booking_mvp_test` riêng trong service PostgreSQL và dùng Redis disposable cho auth.

Test cover: atomic snapshot/rollback với trigger lỗi, overlap/buffer/biên liền kề, JWT/CSRF/ownership, cancel/rebook, availability read-only, expiry qua write path và worker BullMQ (transition/release/history một lần), concurrent idempotency/mismatch/cross-user, split pricing/gap, inactive và validation. Unit pricing chạy qua `npm test` và không phụ thuộc timezone OS.

`npm run test:booking:ui` chạy regression React/JSDOM cho double submit, kết quả request cũ sau đổi account, malformed response và mất phản hồi sau POST. Nút “Kiểm tra lại yêu cầu giữ chỗ” replay đúng key cũ kể cả khi availability đã thành occupied; không tự tạo booking mới. Browser thực vẫn cần kiểm tra riêng responsive, loading/error/empty và luồng đặt/hủy/reload.
