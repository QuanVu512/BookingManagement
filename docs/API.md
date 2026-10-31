# Tham chiếu HTTP API

Trang này định vị các API chính trong source, không thay schema DTO. Nest mount Swagger tại `/api/docs` và OpenAPI JSON tại `/api/docs-json` khi không ở production. Không có global prefix thống nhất: giữ nguyên route trong bảng, đặc biệt `/legal`, `/privacy` và `/support`.

## Base URL và xác thực

Local theo hướng dẫn: `http://localhost:4000`, với `PORT=4000`. Thiếu PORT, bootstrap mặc định `3000`. Frontend lấy origin từ `NEXT_PUBLIC_API_URL`.

- Member dùng cookie HttpOnly `access_token`; JWT strategy cũng hỗ trợ Bearer. Browser gửi `credentials: include`.
- Trước mutation dùng cookie, lấy `GET /api/auth/csrf`, gửi `X-CSRF-Token`, giữ cookie context và Origin đúng `WEB_ORIGIN`.
- Guest quản lý booking qua `X-Booking-Access-Token`; token gắn booking/purpose/expiry. Không gửi token bằng URL hoặc dùng mã booking làm bằng chứng sở hữu.
- Checkout recovery có guard/token riêng; xem [guest recovery contracts](GUEST-BOOKING-RECOVERY-CONTRACTS.md).
- Staff API kiểm JWT/current DB roles và guard theo route; không suy quyền từ giao diện dashboard.

Chi tiết session, lỗi auth và throttling tại [SECURITY.md](SECURITY.md). Webhook dùng signature provider, không dùng session khách hàng.

## Tra cứu public

| Method | Route                          | Mục đích                                                     |
| ------ | ------------------------------ | ------------------------------------------------------------ |
| GET    | `/api/courts`                  | Catalog sân/chi nhánh ACTIVE                                 |
| GET    | `/api/courts/:id`              | Chi tiết sân ACTIVE                                          |
| GET    | `/api/courts/:id/availability` | Query `startsAt`, `endsAt`; kiểm lịch và báo giá theo khoảng |
| GET    | `/api/courts/:id/occupancies`  | Lịch chiếm sân theo DTO query của controller                 |
| GET    | `/legal/policies`              | Danh mục policy                                              |
| GET    | `/legal/booking-offer`         | Chính sách áp dụng cho booking offer                         |
| GET    | `/legal/business`              | Thông tin chủ thể theo cấu hình                              |
| POST   | `/api/ai/chat`                 | Hỏi đáp theo provider/knowledge và hạn mức                   |

Các route dịch vụ bổ sung `/api/courts/:id/services` và `/api/courts/:id/quote` chưa có controller; UI không được xem là contract backend đã hoàn thiện.

## Tài khoản và booking

| Nhóm               | Routes chính                                                                            | Quyền/điều kiện                                            |
| ------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Auth               | `/api/auth/register`, `/login`, `/me`, `/logout`, `/csrf` dưới cùng prefix auth         | Mutation theo CSRF contract; `/me` cần JWT                 |
| Recovery           | `/api/auth/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password` | OTP/proof/token tương ứng                                  |
| Profile            | GET/PATCH `/api/users/me/profile`                                                       | JWT; PATCH có CSRF                                         |
| Tạo hold           | POST `/api/bookings`                                                                    | JWT + CSRF, body idempotency key                           |
| Danh sách/chi tiết | GET `/api/bookings/me`, GET `/api/bookings/:id`                                         | Owner/current authorization; list có cursor                |
| Hủy hold           | PATCH `/api/bookings/:id/cancel`                                                        | Chỉ hold chưa thanh toán đủ điều kiện; không phải hủy paid |
| Hủy paid           | POST `/api/bookings/:id/cancel-quote`, `/cancel-apply` trên cùng booking                | Quote còn hiệu lực, consent và idempotency                 |

Payload member hold được định nghĩa tại [DTO](../backend/src/modules/bookings/presentation/dto/booking-request.dto.ts): `courtId`, `startsAt`, `endsAt`, `idempotencyKey`, `policyAccepted: true`; `prepaymentPercent` tùy chọn và chỉ nhận `30`. Datetime có timezone và chính xác đến phút. Giá do server tính; không gửi tổng tiền client làm authority.

Booking response thường có `{ success: true, data }`; list có `nextCursor`. Không coi mọi endpoint là cùng envelope: auth và các module khác có response riêng. Xem DTO/presenter và Swagger của revision tương ứng.

## Guest, payment và staff

| Nhóm              | Routes chính                                                                                     | Điều kiện                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Guest OTP/hold    | POST `/api/guest/bookings/send-otp`, `/verify-otp`, `/resume-intent`; POST `/api/guest/bookings` | Proof, contact và intent theo DTO; không tạo user giả               |
| Guest recovery    | POST `/api/guest/bookings/:bookingId/cancel-hold`; GET `/api/guest/bookings/:bookingId/recovery` | Checkout token guard riêng                                          |
| Member payment    | POST/GET `/api/payments/requests`; GET `/api/payments/requests/:id`, `/:id/status`               | JWT, ownership; mutation CSRF                                       |
| Guest payment     | `/api/guest/payments/requests` và detail/status                                                  | Guest token + bookingId theo guard                                  |
| Provider callback | POST `/api/webhooks/payos`                                                                       | Signature và inbox processing phía server                           |
| Check-in token    | POST `/api/bookings/:id/check-in-token`; guest tương ứng dưới `/api/guest/bookings/:bookingId`   | Owner/token, trạng thái và tiền verified                            |
| Staff check-in    | POST `/api/staff/check-ins/verify`, `/manual`; POST `/api/staff/bookings/:id/complete`           | JWT + CSRF + STAFF/MANAGER/ADMIN                                    |
| Staff late cancel | POST `/api/staff/bookings/:id/late-cancel`                                                       | Role guard, reason, thời gian và idempotency                        |
| Refund            | `/api/refunds`, `/api/staff/refunds`, các action approve/reject/destination/reconcile            | Quyền riêng từng action; không suy tất cả staff đều đọc destination |

Các path rút gọn ở bảng phải ghép với prefix của cùng nhóm; controller/DTO là nguồn chính xác khi tích hợp. Không gọi request tạo tiền hoặc webhook thật để thử documentation.

## Lỗi và retry

| HTTP    | Cách xử lý                                                               |
| ------- | ------------------------------------------------------------------------ |
| 400     | Sửa input/DTO, timezone hoặc khoảng thời gian                            |
| 401     | Phiên hoặc token không hợp lệ; auth code có thể yêu cầu xác minh email   |
| 403     | Kiểm Origin, CSRF, quyền hoặc điều kiện truy cập                         |
| 404     | Không tồn tại/không được truy cập; không suy resource người khác tồn tại |
| 409/410 | Xung đột trạng thái, slot hoặc hết hạn; tải lại trạng thái server        |
| 429     | Tôn trọng rate limit và Retry-After nếu có                               |
| 503     | Dependency/config chưa sẵn sàng; không giả trạng thái thành công         |

Mutation không tự retry bằng key mới sau timeout. Kiểm tra trạng thái hoặc replay cùng logical request/key theo contract; payment UNKNOWN cần đối soát. Response lỗi có thể có `code`, `message`, `statusCode` tùy module; không chỉ parse một chuỗi tiếng Việt.

## Nguồn

Controller/DTO tại [Auth](../backend/src/modules/auth/auth.controller.ts), [Bookings](../backend/src/modules/bookings/presentation/bookings.controller.ts), [Payments](../backend/src/modules/payments/presentation/payments.controller.ts), [Guest](../backend/src/modules/payments/presentation/guest-bookings.controller.ts), [Check-in](../backend/src/modules/check-in/presentation/staff-checkins.controller.ts), [Courts](../backend/src/modules/courts/presentation/courts.controller.ts). Xem [Workflows](WORKFLOWS.md) để hiểu điều kiện nghiệp vụ; source không thay evidence runtime.
