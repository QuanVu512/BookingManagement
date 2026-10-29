# Kiến trúc modular monolith

Next.js là frontend riêng; một backend NestJS chứa các module nghiệp vụ và dùng một PostgreSQL database được chọn bằng DATABASE_URL (local mặc định pickleball, Neon dùng DB trong URL). Root manifest/lockfile quản lý dependency chung. Monolith mô tả đơn vị backend triển khai; MVC/layering mô tả trách nhiệm code. Next cung cấp giao diện, Nest API dùng Controller → Service → Repository khi triển khai từng luồng.

```text
booking-project/
├── frontend/
│   ├── app/
│   ├── next.config.ts
│   └── tsconfig.json
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── courts/
│   │   │   ├── bookings/
│   │   │   ├── payments/
│   │   │   ├── ai-assistant/
│   │   │   ├── privacy-requests/
│   │   │   ├── notifications/
│   │   │   └── check-in/
│   │   ├── infrastructure/
│   │   │   ├── prisma/
│   │   │   ├── redis/
│   │   │   └── queue/
│   │   └── generated/prisma/    # Sau prisma generate, ignored
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   │       ├── migration_lock.toml
│   │       └── 20261009000100_v1_initial/migration.sql
│   ├── test/
│   ├── nest-cli.json
│   ├── prisma.config.ts
│   ├── tsconfig.json
│   └── tsconfig.build.json
├── infra/docker-compose.yml
├── tests/load/smoke.js
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATABASE-DESIGN.md
│   ├── OPERATIONS.md
│   └── TECH-STACK.md
├── guide/                       # Học liệu cá nhân, Git ignored
├── ai/
├── coordination/
├── .github/
├── .env.example
├── package.json
└── package-lock.json
```

backend/dist và frontend/.next được sinh khi build, không commit. Dist cũ ở root đã chuyển vào.temp/task-010/legacy-build để khôi phục nếu cần. Không có apps/libs trong backend hiện tại.

## Ownership

| Module               | Persistence models                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Auth                 | User, UserRole, RefreshToken                                                                                    |
| Users                | UserProfile                                                                                                     |
| Courts               | Branch, Court, BranchBusinessHour, PriceRule                                                                    |
| Bookings             | Booking, CourtOccupancy, BookingPriceItem, BookingStatusHistory, BookingAccessToken, BookingCancellationRequest |
| Check-in             | BookingCheckin                                                                                                  |
| Payments             | PaymentRequest, PaymentTransaction, PaymentWebhookEvent, RefundRequest, RefundAttempt                           |
| Privacy Requests     | PrivacyRequest (DSR)                                                                                            |
| AI Assistant         | Knowledge policies, Static Provider, Redis Budget Adapter                                                       |
| Notifications        | NotificationDelivery                                                                                            |
| Queue infrastructure | OutboxEvent                                                                                                     |

modules/*/entities.ts chỉ alias generated persistence types. schema.prisma là định nghĩa duy nhất cho entities. DTO API khác entities; không lộ password, tokens, payload ngân hàng hoặc contact guest trong lịch public.

Controller xử lý HTTP và validation ở ranh giới. Service điều phối use case. Repository truy cập DB theo module; tránh tạo generic repository che transaction/Prisma API khi chưa có nhu cầu. Module khác gọi service public, không sửa bảng của nhau tùy tiện. Transaction xuyên module được điều phối ở use case rõ và dùng cùng transaction client.

## Runtime

```text
Browser -> Next frontend -> Nest API
                            ├─ Auth / Users
                            ├─ Courts / Bookings / Check-in
                            ├─ Payments
                            └─ Notifications + Socket.IO
Nest -> PostgreSQL (DATABASE_URL)
Nest -> Redis cache / lock / BullMQ
```

API và worker booking expiry hiện chạy cùng backend process. Các worker email/retry/outbox khác chưa được implement. Sau này có thể tách worker process từ cùng codebase khi cần; điều đó chưa bắt buộc tách domain thành microservices hay DB riêng.

BullMQ là queue cho task như expire hold/email/retry; hiện mới có worker expire hold, email/retry còn là thiết kế. RabbitMQ là message broker thường dùng liên hệ thống; gRPC là RPC protocol; Jest là test runner/assertions; Socket.IO phục vụ sự kiện realtime cho browser. Các công cụ giải quyết các nhu cầu khác nhau. RabbitMQ/gRPC là bài học mở rộng, không phải dependency bắt buộc của monolith.

## Ràng buộc và phạm vi

Giữ30%/100%, guest100%, buffer15phút không tính phí và phạt hủy10% với consent. One DB cho FK và transaction cùng DB, nhưng DB commit với Redis/bank không atomic: outbox + idempotency và đối soát vẫn cần khi implement.

V1 có models/migration; trạng thái auth/API hiện có theo [BACKEND-ARCHITECTURE.md](BACKEND-ARCHITECTURE.md). Workflows booking, payment, webhook, refund, check-in và notification hoàn chỉnh chưa được implement. Schema không tự xác minh chuyển khoản và worker không tự xuất hiện sau migration. Mốc hủy/check-in/rounding còn mở.

Versions và lockfile giữ nguyên. Scripts Nest đổi cwd sang backend cho CLI đọc cấu hình đúng; Prisma dùng config backend từ root; Compose giữ project name booking-project để giữ tên volume mặc định. Các helper/folder trống không có trách nhiệm được dọn, common sẽ thêm khi có thành phần dùng chung thật.

Nguồn: [Nest feature modules](https://docs.nestjs.com/modules), [Nest MVC](https://docs.nestjs.com/http/mvc), [Nest queues](https://docs.nestjs.com/application/queues), [Prisma models](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/models).

Commands hệ thống: [OPERATIONS.md](OPERATIONS.md). Học liệu Prisma/setup cá nhân nằm trong guide/ và được Git ignore.
