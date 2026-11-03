# Kiến trúc Backend

Backend là một NestJS 10 modular monolith đặt tại `backend/src/`, kết nối một cơ sở dữ liệu PostgreSQL 16 qua Prisma và Redis 7 qua `ioredis` / `BullMQ`. Mọi HTTP endpoint đều có tiền tố toàn cục `/api` (cấu hình trong [`backend/src/main.ts`](../backend/src/main.ts)).

## Luồng xử lý và phân lớp trong Module

```text
HTTP Controller / Guard / DTO / Presenter (presentation/)
                        │
                        ▼
        Application Use Case / Service (application/)
                        │
                        ▼
                 Port Contract (ports/)
                        ▲
                        │
          Infrastructure Adapter (infrastructure/)
         ├── PostgreSQL / Prisma (session timezone=UTC)
         ├── Redis (CSRF, Rate Limit, Slot Lock, AI Budget)
         └── BullMQ / Interval Workers (Expiry, Reconcile, Outbox Mail)
```

- **Presentation (`presentation/` hoặc `controllers/`, `dto/`, `presenters/`)**: Nhận HTTP request, kiểm tra dữ liệu đầu vào qua `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`), thực thi các Guard bảo mật (`JwtAuthGuard`, `AuthCsrfGuard`, `RolesGuard`, `GuestTokenGuard`, `GuestCheckoutTokenGuard`, `DemoPaymentAccessGuard`), gọi use case và ánh xạ lỗi miền sang mã lỗi HTTP chuẩn.
- **Application (`application/`)**: Điều phối từng ca sử dụng nghiệp vụ cụ thể (`CreateHoldUseCase`, `QuoteBookingUseCase`, `ListMyBookingsUseCase`, `CancelBookingUseCase`, `ExpireEligibleHoldsUseCase`, `RequestGuestRecoveryLinkUseCase`...). Mỗi use case quản lý ranh giới giao dịch (`TransactionContext`) và các quy tắc chính sách mà không phụ thuộc vào chi tiết giao thức HTTP.
- **Ports (`ports/`)**: Khai báo các hợp đồng giao tiếp hạ tầng (`BookingStore`, `BookingSlotLock`, `CourtScheduleReader`, `AccountStore`, `PasswordHasher`, `SessionTokenSigner`).
- **Infrastructure (`infrastructure/`)**: Cài đặt cụ thể cho các Port bằng Prisma, Redis, payOS SDK hoặc Nodemailer SMTP, được tiêm phụ thuộc (DI) tại tệp `.module.ts` của từng miền.

## Danh mục các Module trong `backend/src/`

| Module                                   | Đường dẫn                   | Trạng thái và trách nhiệm thực tế trong mã nguồn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthModule`                             | `modules/auth/`             | Đăng ký, đăng nhập, xác thực OTP tài khoản, làm mới phiên (`refresh`), đăng xuất, cấp/kiểm tra cookie `HttpOnly` và `X-CSRF-Token`. Chuẩn hóa số điện thoại Việt Nam về 10 chữ số `0xxxxxxxxx` bằng biểu thức chính quy đồng bộ với PostgreSQL.                                                                                                                                                                                                                                                                                                                                                     |
| `UsersModule`                            | `modules/users/`            | Xem và cập nhật hồ sơ cá nhân (`GET/PATCH /api/users/me/profile`), đổi mật khẩu và yêu cầu ẩn/xóa tài khoản (`POST /api/users/me/Erase-request`).                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `CourtsModule`                           | `modules/courts/`           | Danh sách và chi tiết sân `ACTIVE`, lịch chiếm sân công khai (`GET /api/courts/:id/occupancies`), kiểm tra khung giờ trống (`availability`) và tính giá theo từng phút với làm tròn `BigInt HALF_UP`. Export `CourtScheduleReader` cho `BookingsModule`.                                                                                                                                                                                                                                                                                                                                            |
| `BookingsModule` + `BookingExpiryModule` | `modules/bookings/`         | Báo giá trực tiếp (`POST /api/bookings/quote`), tạo giữ chỗ `HOLDING` 5 phút với mức cọc **30%** (`POST /api/bookings`), danh sách đơn của tôi, báo phí hủy và hủy đơn. Tích hợp `RedisBookingSlotLock` làm khóa bổ trợ trước khi vào giao dịch PostgreSQL, tự giải phóng hold quá hạn trên đường ghi (self-heal) và chạy BullMQ worker `booking-expiry` định kỳ.                                                                                                                                                                                                                                   |
| `PaymentsModule`                         | `modules/payments/`         | Quản lý toàn bộ luồng khách vãng lai (OTP email 6 số `guest_otp_challenges` → `guest_otp_proofs`, giữ chỗ vãng lai 2 pha `guest_checkout_intents` + `payment_requests` trạng thái `CREATING`, khôi phục phiên qua token một lần `CHECKOUT_RECOVERY`, tra cứu đơn `/api/guest/bookings/lookup`), tích hợp cổng thu/chi payOS, xử lý webhook có kiểm tra chữ ký HMAC, thu tiền mặt/chuyển khoản tại quầy cho nhân viên, phê duyệt hoàn tiền cho quản lý, ghi `payment_audit_logs`, gửi thư qua `GuestRecoveryMailWorker` (`outbox_messages` mã hóa AES-256-GCM) và hỗ trợ bộ giả lập thanh toán Demo. |
| `CheckInModule`                          | `modules/check-in/`         | Phát hành mã QR check-in một lần (`CHECKIN`), xác minh check-in bằng QR hoặc thủ công bởi `STAFF`/`MANAGER`/`ADMIN` (kiểm tra đủ tiền đã xác minh) và đánh dấu hoàn tất ca chơi (`COMPLETED`).                                                                                                                                                                                                                                                                                                                                                                                                      |
| `AiAssistantModule`                      | `modules/ai-assistant/`     | Trợ lý hỏi đáp chính sách đặt sân, hủy sân, thanh toán (`POST /api/ai/chat`), kiểm soát ngân sách token qua Redis (`RedisAiBudgetAdapter`) với chế độ đọc cơ sở tri thức nội bộ an toàn khi không bật LLM ngoài.                                                                                                                                                                                                                                                                                                                                                                                    |
| `LegalContentModule`                     | `modules/legal-content/`    | Phục vụ văn bản pháp lý có phiên bản (`GET /api/legal/:slug`) cho điều khoản dịch vụ, chính sách bảo mật và thông báo thu thập dữ liệu.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `PrivacyRequestsModule`                  | `modules/privacy-requests/` | Tiếp nhận và tra cứu yêu cầu quyền dữ liệu cá nhân (DSR) cho cả thành viên đã đăng nhập và khách vãng lai.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `SupportModule`                          | `modules/support/`          | Tiếp nhận yêu cầu liên hệ/hỗ trợ từ khách hàng (`POST /api/support/inquiries`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `NotificationsModule`                    | `modules/notifications/`    | Chứa scaffold cổng thời gian thực Socket.IO; hiện **chưa được import** vào `AppModule` để đảm bảo an toàn cho tới khi hoàn tất xác thực bắt tay (handshake) và phân quyền phòng.                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Hạ tầng kỹ thuật cốt lõi (`backend/src/infrastructure/`)

1. **`infrastructure/prisma/prisma.service.ts`**:
   - Quản lý vòng đời kết nối `PrismaClient` (`onModuleInit`, `onModuleDestroy`).
   - Hàm `utcConnectionString` tự động chuẩn hóa `DATABASE_URL` để gắn tham số `options=-c timezone=UTC`. Nhờ vậy, mọi truy vấn SQL thô dùng `clock_timestamp()` hoặc so sánh `TIMESTAMPTZ` trên PostgreSQL luôn chạy ở múi giờ UTC bất kể cấu hình múi giờ của hệ điều hành máy chủ.
2. **`infrastructure/redis/` và `infrastructure/queue/`**:
   - Cung cấp kết nối Redis dùng chung cho kho lưu trữ CSRF/rate-limit, `RedisBookingSlotLock`, `RedisAiBudgetAdapter` và hàng đợi BullMQ.
3. **Các Worker và dịch vụ chạy nền**:
   - **`BookingExpiryModule`**: BullMQ queue `booking-expiry` quét và chuyển các đơn `HOLDING` đã quá `hold_expires_at` sang `EXPIRED`, đồng thời giải phóng `court_occupancies` sang `RELEASED` trong cùng giao dịch PostgreSQL.
   - **`GuestCheckoutReconcileService`**: Tự động hoàn tất hoặc thu hồi các bản ghi `PaymentRequest` trạng thái `CREATING` của khách vãng lai bị gián đoạn giữa Pha 1 và Pha 2.
   - **`GuestRecoveryMailWorker`**: Đọc bảng `outbox_messages`, giải mã payload AES-256-GCM bằng khóa `GUEST_OUTBOX_ENCRYPTION_KEY_V1`, gửi email khôi phục/quản lý đơn qua SMTP (`Nodemailer`), cập nhật trạng thái `SENT`/`FAILED`/`EXPIRED_SKIPPED` và xóa trắng bản mã (`purged_at`) sau khi hoàn tất.
   - **`PaymentMaintenanceWorker`**: Xử lý thử lại webhook, theo dõi hạn thanh toán và đối soát các giao dịch thanh toán/hoàn tiền.

## Nguyên tắc Giao dịch và Đồng thời

- **PostgreSQL là nguồn sự thật duy nhất cho lịch sân**: Mọi thao tác giữ sân, hủy sân hoặc hết hạn giữ chỗ đều cập nhật đồng thời `bookings`, `court_occupancies` và `booking_status_history` trong một giao dịch cơ sở dữ liệu. Ràng buộc loại trừ `court_occupancies_no_overlap_active` chặn tuyệt đối hai khoảng chiếm sân `ACTIVE` chồng lấn trên cùng một sân.
- **Tách biệt giao dịch DB và lời gọi mạng bên ngoài**: Không giữ mở giao dịch PostgreSQL trong khi chờ phản hồi HTTP từ cổng thanh toán payOS hoặc máy chủ SMTP. Luồng thanh toán và thông báo luôn ghi nhận trạng thái bền vững (`PaymentRequest` ở trạng thái `CREATING`, `OutboxMessage` ở trạng thái `QUEUED`) trong giao dịch DB trước, sau đó mới thực hiện cuộc gọi mạng và đối soát kết quả.

## Tài liệu tham chiếu

- [Tổng quan kiến trúc (ARCHITECTURE.md)](ARCHITECTURE.md)
- [Danh mục API và DTO (API.md)](API.md)
- [Cơ sở dữ liệu (DATABASE.md)](DATABASE.md) và [Thiết kế CSDL chi tiết (DATABASE-DESIGN.md)](DATABASE-DESIGN.md)
- [Hợp đồng khôi phục đơn khách vãng lai (GUEST-BOOKING-RECOVERY-CONTRACTS.md)](GUEST-BOOKING-RECOVERY-CONTRACTS.md)
