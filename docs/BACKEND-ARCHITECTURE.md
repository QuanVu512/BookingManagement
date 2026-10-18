# Kiến trúc backend

Backend là một NestJS modular monolith trong `backend/src/`, kết nối một PostgreSQL database qua Prisma. Ranh giới module là cách tổ chức code; hiện tại đây chưa phải các service triển khai độc lập.

## Luồng và ownership

```text
HTTP Controller → Application use case → Port ← Infrastructure adapter
                                                     ├→ PostgreSQL/Prisma
                                                     ├→ Redis
                                                     └→ BullMQ (plumbing hiện có)
```

- **Controller / presenter** nhận HTTP/DTO, gọi use case tương ứng và map response/error. Contract HTTP cần được giữ ổn định với frontend.
- **Use case / interactor** điều phối một mục tiêu nghiệp vụ, policy, port và transaction boundary. Module mới ưu tiên các hành động có tên rõ như create hold, cancel hold hoặc list my bookings; không dùng một service tổng chứa mọi luồng của miền.
- **Port / adapter** tách contract cần cho nghiệp vụ khỏi Prisma/Redis/SDK; module là nơi nối provider. Mũi tên `adapter → port` thể hiện dependency source vào contract, còn lời gọi runtime qua implementation được DI cung cấp.
- **Service chuyên biệt / facade** vẫn phù hợp khi sở hữu một năng lực cohesive hoặc giữ tương thích caller; facade chỉ ủy quyền tới component/use case. Các use case độc lập không bị buộc đi qua một service trung tâm.
- Auth facade không nhận Express Response hoặc gọi trực tiếp Prisma/Argon/JWT: `AccountStore`, `PasswordHasher`, `SessionTokenSigner` nối adapter qua AuthModule; cookie presenter sở hữu HTTP cookie. `application/auth-results.ts` định nghĩa kết quả login; account/password/signing ports nằm trong `ports/`. Đây là refactor từng lát, recovery/session service vẫn có trách nhiệm orchestration và persistence riêng; chưa di chuyển toàn module sang domain thuần.
- **Prisma** cung cấp truy vấn và model từ schema. Hiện chưa có lớp repository riêng cho mọi module; không tạo abstraction repository chỉ để bọc một lời gọi Prisma.
- Module khác dùng contract/API public do module sở hữu công bố; không deep-import adapter/private helper hoặc sửa persistence của miền khác tùy tiện. Invariant xuyên miền phải nằm trong use case có quyền điều phối và cùng transaction boundary.
- Booking sở hữu use case create/availability/list/cancel và `BookingStore` cho aggregate/transaction; Courts export `CourtScheduleReader` cho schedule/pricing và không import ngược Booking. `TransactionContext` là alias tường minh của Prisma transaction client, được truyền từ `BookingStore.withTransaction` sang `CourtScheduleReader` để giữ một transaction PostgreSQL.

Booking là mẫu tổ chức module theo `application/`, `ports/`, `infrastructure/`, `presentation/`. Implementation hiện còn import NestJS/HTTP DTO trong use case và Prisma transaction alias qua port; cấu trúc folder chưa chứng minh lõi độc lập framework. Module mới tách application input/result/error khỏi transport và giữ type hạ tầng sau adapter. Các coupling hiện có chỉ được refactor trong task có scope tương ứng, bảo toàn transaction/API.

## Module

| Module          | Trạng thái trong source                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| `auth`          | Controller/service login, register, session lookup, logout; JWT strategy và guards       |
| `users`         | Scaffold controller/service; chức năng còn hạn chế                                       |
| `courts`        | Danh sách/chi tiết ACTIVE, giá từ PriceRule, availability theo khoảng có buffer          |
| `bookings`      | HOLDING 5 phút, lazy expiry, idempotency, list/cancel theo owner; transaction PostgreSQL |
| `payments`      | Module boundary rỗng; chưa có provider/webhook/refund workflow                           |
| `check-in`      | Module boundary rỗng; chưa có check-in workflow                                          |
| `notifications` | Realtime gateway/module; chưa có pipeline gửi email hoàn chỉnh                           |

## Hạ tầng

- `infrastructure/prisma/`: Prisma module/service; service mở kết nối khi khởi động và đóng khi shutdown.
- `infrastructure/redis/`: Redis client dùng `REDIS_URL`.
- `infrastructure/queue/`: BullMQ connection lấy cấu hình Redis host/port/password.
- `modules/notifications/`: Socket.IO realtime scaffold chưa được nạp bởi AppModule. Chỉ bật lại sau khi có handshake auth/Origin/room ownership và test tương ứng.

Redis/BullMQ/Socket.IO có mặt trong scaffold nhưng không đồng nghĩa đã có worker, distributed lock hoặc nghiệp vụ retry chạy. Booking có persistence port `BookingStore` và adapter `PrismaBookingStore`; không suy từ đó rằng mọi module đã có repository hoặc worker xử lý outbox.

## Transaction và dữ liệu

Giữ thao tác booking, occupancy và các dòng lịch sử liên quan nhất quán bằng transaction DB; constraint SQL là lớp bảo vệ concurrency bổ sung. Redis lock không thay thế exclusion constraint/transaction. DB transaction không thể atomic với ngân hàng hay Redis; thiết kế tích hợp cần idempotency, outbox và đối soát.

Contract model và SQL constraint được tóm tắt trong [DATABASE.md](DATABASE.md). [BOOKING-MVP.md](BOOKING-MVP.md) mô tả API giữ chỗ đã triển khai; [WORKFLOWS.md](WORKFLOWS.md) phân biệt phần này với thiết kế payment/check-in còn thiếu.
