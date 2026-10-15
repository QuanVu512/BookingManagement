# Kiến trúc backend

Backend là một NestJS modular monolith trong `backend/src/`, kết nối một PostgreSQL database qua Prisma. Ranh giới module là cách tổ chức code; hiện tại đây chưa phải các service triển khai độc lập.

## Luồng và ownership

```text
HTTP Controller → Service/use case → PrismaService → PostgreSQL
                                      ├→ Redis
                                      └→ BullMQ (plumbing hiện có)
```

- **Controller** nhận HTTP, DTO và chuyển việc cho service. Contract HTTP cần được giữ ổn định với frontend.
- **Service** điều phối use case và transaction cần thiết.
- Auth facade không nhận Express Response hoặc gọi trực tiếp Prisma/Argon/JWT: `AccountStore`, `PasswordHasher`, `SessionTokenSigner` nối adapter qua AuthModule; cookie presenter sở hữu HTTP cookie. `application/auth-results.ts` định nghĩa kết quả login; account/password/signing ports nằm trong `ports/`. Đây là refactor từng lát, recovery/session service vẫn có trách nhiệm orchestration và persistence riêng; chưa di chuyển toàn module sang domain thuần.
- **Prisma** cung cấp truy vấn và model từ schema. Hiện chưa có lớp repository riêng cho mọi module; không tạo abstraction repository chỉ để bọc một lời gọi Prisma.
- Module khác dùng API public/service của module sở hữu; không sửa persistence của miền khác tùy tiện. Invariant xuyên miền phải nằm trong use case có quyền điều phối và cùng transaction client.

## Module

| Module          | Trạng thái trong source                                                            |
| --------------- | ---------------------------------------------------------------------------------- |
| `auth`          | Controller/service login, register, session lookup, logout; JWT strategy và guards |
| `users`         | Scaffold controller/service; chức năng còn hạn chế                                 |
| `courts`        | Endpoint đọc danh sách sân và service Prisma/fallback                              |
| `bookings`      | Module boundary rỗng; chưa có booking workflow                                     |
| `payments`      | Module boundary rỗng; chưa có provider/webhook/refund workflow                     |
| `check-in`      | Module boundary rỗng; chưa có check-in workflow                                    |
| `notifications` | Realtime gateway/module; chưa có pipeline gửi email hoàn chỉnh                     |

## Hạ tầng

- `infrastructure/prisma/`: Prisma module/service; service mở kết nối khi khởi động và đóng khi shutdown.
- `infrastructure/redis/`: Redis client dùng `REDIS_URL`.
- `infrastructure/queue/`: BullMQ connection lấy cấu hình Redis host/port/password.
- `modules/notifications/`: Socket.IO realtime scaffold chưa được nạp bởi AppModule. Chỉ bật lại sau khi có handshake auth/Origin/room ownership và test tương ứng.

Redis/BullMQ/Socket.IO có mặt trong scaffold nhưng không đồng nghĩa đã có worker, distributed lock hoặc nghiệp vụ retry chạy. Hiện chưa có module-owned repository hoặc worker xử lý outbox được xác nhận trong source.

## Transaction và dữ liệu

Giữ thao tác booking, occupancy và các dòng lịch sử liên quan nhất quán bằng transaction DB; constraint SQL là lớp bảo vệ concurrency bổ sung. Redis lock không thay thế exclusion constraint/transaction. DB transaction không thể atomic với ngân hàng hay Redis; thiết kế tích hợp cần idempotency, outbox và đối soát.

Contract model và SQL constraint được tóm tắt trong [DATABASE.md](DATABASE.md). Các workflow vẫn chưa triển khai được liệt kê ở [WORKFLOWS.md](WORKFLOWS.md).
