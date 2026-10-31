# Kiến trúc backend

Backend là một NestJS modular monolith trong `backend/src/`, kết nối một PostgreSQL database qua Prisma. Ranh giới module là cách tổ chức code; hiện tại đây chưa phải các service triển khai độc lập.

## Luồng và ownership

```text
HTTP Controller → Application use case → Port ← Infrastructure adapter
                                                     ├→ PostgreSQL/Prisma
                                                     ├→ Redis
                                                     └→ BullMQ (expiry, payment/recovery/outbox jobs)
```

- **Controller / presenter** nhận HTTP/DTO, gọi use case tương ứng và map response/error. Contract HTTP cần được giữ ổn định với frontend.
- **Use case / interactor** điều phối một mục tiêu nghiệp vụ, policy, port và transaction boundary. Module mới ưu tiên các hành động có tên rõ như create hold, cancel hold hoặc list my bookings; không dùng một service tổng chứa mọi luồng của miền.
- **Port / adapter** tách contract cần cho nghiệp vụ khỏi Prisma/Redis/SDK; module là nơi nối provider. Mũi tên `adapter → port` thể hiện dependency source vào contract, còn lời gọi runtime qua implementation được DI cung cấp.
- **Service chuyên biệt / facade** vẫn phù hợp khi sở hữu một năng lực cohesive hoặc giữ tương thích caller; facade chỉ ủy quyền tới component/use case. Các use case độc lập không bị buộc đi qua một service trung tâm.
- Auth facade không nhận Express Response hoặc gọi trực tiếp Prisma/Argon/JWT: `AccountStore`, `PasswordHasher`, `SessionTokenSigner` nối adapter qua AuthModule; cookie presenter sở hữu HTTP cookie. `application/auth-results.ts` định nghĩa kết quả login; account/password/signing ports nằm trong `ports/`. Đây là refactor từng lát, recovery/session service vẫn có trách nhiệm orchestration và persistence riêng; chưa di chuyển toàn module sang domain thuần.
- **Prisma** cung cấp truy vấn và model từ schema. Hiện chưa có lớp repository riêng cho mọi module; không tạo abstraction repository chỉ để bọc một lời gọi Prisma.
- Module khác dùng contract/API public do module sở hữu công bố; không deep-import adapter/private helper hoặc sửa persistence của miền khác tùy tiện. Invariant xuyên miền phải nằm trong use case có quyền điều phối và cùng transaction boundary.
- Booking sở hữu use case create/availability/list/cancel, `ExpireEligibleHoldsUseCase` và `BookingStore` cho aggregate/transaction; Courts export `CourtScheduleReader` cho schedule/pricing và không import ngược Booking. `TransactionContext` là alias tường minh của Prisma transaction client, được truyền từ `BookingStore.withTransaction` sang `CourtScheduleReader` để giữ một transaction PostgreSQL. `BookingsModule` export `BookingStore`; `BookingExpiryModule` riêng nối BullMQ worker/scheduler nên module HTTP và unit test không phụ thuộc Redis.

Booking là mẫu tổ chức module theo `application/`, `ports/`, `infrastructure/`, `presentation/`. Application nhận command/query nội bộ và ném typed error trong `domain/booking-errors.ts`; controller/presenter sở hữu DTO và map error sang HTTP exception. Use case vẫn dùng `@nestjs/common` cho DI/logger và `TransactionContext` alias Prisma qua port, nên lõi chưa độc lập hoàn toàn framework. Module mới giữ application input/result/error tách khỏi transport và type hạ tầng sau adapter; chỉ refactor coupling trong task có scope tương ứng, bảo toàn transaction/API.

## Module

| Module             | Trạng thái trong source                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`             | Controller/service login, register, session lookup, logout; JWT strategy và guards; chuẩn hóa số điện thoại VN bằng Pure Regex                     |
| `users`            | Profile controller, get/update use case; scaffold legacy không đại diện toàn module                                                                |
| `courts`           | Danh sách/chi tiết ACTIVE, domain pricing tính giá theo phút (BigInt HALF_UP), availability theo khoảng có buffer                                  |
| `bookings`         | HOLDING 5 phút, expiry qua BullMQ worker + self-heal write path, idempotency, cọc 30%, list/cancel theo owner; transaction PostgreSQL              |
| `payments`         | Guest OTP/checkout/recovery, payOS request/webhook inbox, receipt/coordinator, staff reconcile/refund và audit; provider thực cần nghiệm thu riêng |
| `ai-assistant`     | Q&A Assistant (`/api/ai/chat`), quản lý hạn mức token qua Redis (`RedisAiBudgetAdapter`), knowledge policies và static provider                    |
| `privacy-requests` | Tiếp nhận/theo dõi DSR qua adapter hiện có; store memory không chứng minh retention hoặc fulfilment/xóa dữ liệu đã hoàn tất                        |
| `check-in`         | Cấp token CHECKIN, verify QR/manual và complete; guard quyền, thời gian và đủ tiền verified                                                        |
| `notifications`    | Socket.IO scaffold chưa nạp; email booking qua outbox còn thiếu delivery sink                                                                      |

## Hạ tầng

- `infrastructure/prisma/`: Prisma module/service; service mở kết nối khi khởi động và đóng khi shutdown.
- `infrastructure/redis/`: Redis client dùng `REDIS_URL`.
- `infrastructure/queue/`: BullMQ connection lấy cấu hình Redis host/port/password.
- `modules/bookings/booking-expiry.module.ts`: đăng ký queue `booking-expiry`, processor và scheduler định kỳ; processor đóng worker/queue khi shutdown. `BookingsModule` không import BullMQ.
- `modules/notifications/`: Socket.IO realtime scaffold chưa được nạp bởi AppModule. Chỉ bật lại sau khi có handshake auth/Origin/room ownership và test tương ứng.

BullMQ có booking expiry và payment jobs cho webhook retry, recovery, terminal watch, cancel retry, outbox dispatch và guest reconcile. Outbox chưa có delivery sink hoàn chỉnh: bounded retry/quarantine không chứng minh thư đã gửi. Socket.IO chưa được AppModule nạp. Core booking không dùng Redis lock. Booking có persistence port `BookingStore` và adapter `PrismaBookingStore`; không suy từ đó rằng mọi module đã có repository hoặc worker xử lý outbox.

## Transaction và dữ liệu

Giữ thao tác booking, occupancy và các dòng lịch sử liên quan nhất quán bằng transaction DB; constraint SQL là lớp bảo vệ concurrency bổ sung. Redis lock không thay thế exclusion constraint/transaction. DB transaction không thể atomic với ngân hàng hay Redis; thiết kế tích hợp cần idempotency, outbox và đối soát.

Contract model và SQL constraint được tóm tắt trong [DATABASE.md](DATABASE.md). [BOOKING-MVP.md](BOOKING-MVP.md) mô tả API giữ chỗ đã triển khai; [WORKFLOWS.md](WORKFLOWS.md) mô tả payment/check-in hiện có và giới hạn nghiệm thu. Tham chiếu thêm [API](API.md) và [Configuration](CONFIGURATION.md).
