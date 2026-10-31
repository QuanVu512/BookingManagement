# Bản đồ codebase

Dùng bản đồ này để định vị source và contract. [README](../README.md) giới thiệu sản phẩm; [Getting started](GETTING-STARTED.md) hướng dẫn chạy local. Cấu trúc không chứng minh mức nghiệm thu runtime.

## Thư mục

```text
backend/
  src/
    modules/             Auth, users, courts, bookings, payments, check-in
                         ai-assistant, legal-content, privacy-requests, support
    infrastructure/      Prisma, Redis, BullMQ
    app.module.ts        Module wiring và global guards/filter
    main.ts              CORS, Swagger, security headers, listen
  prisma/                Schema, SQL migrations, seed và audit scripts
  test/                  HTTP/integration suites và helpers
frontend/
  app/                   Next.js routes và layouts
  features/              Components/hooks/api/model theo feature
  components/            Auth, home, arena và các UI dùng chung
  context/               Auth/theme state
  services/              HTTP services dùng chung
  types/                 Frontend contracts
infra/docker-compose.yml PostgreSQL, Redis, Mailpit và storage test riêng
tests/load/              Smoke/load scripts
tools/                   Công cụ kiểm tra repository
.github/workflows/       CI
package.json             Scripts/dependency chung
package-lock.json        Dependency tree đã khóa
docs/                    Tài liệu public
```

Generated client `backend/src/generated/prisma/`, `backend/dist/`, `frontend/.next/` và `node_modules/` là output/cache. Học liệu và cấu hình/điều phối AI local không phải nguồn contract sản phẩm.

## Định vị theo nhu cầu

| Nhu cầu                    | Điểm bắt đầu                                                                                   | Contract                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Login/OTP/recovery         | `backend/src/modules/auth/`, `frontend/components/auth/`                                       | [Security](SECURITY.md)                                              |
| Hồ sơ                      | `backend/src/modules/users/presentation/`, `application/`                                      | [API](API.md)                                                        |
| Catalog/giá                | `backend/src/modules/courts/`, `frontend/features/courts/`                                     | [Booking MVP](BOOKING-MVP.md)                                        |
| Hold/expiry/cancel         | `backend/src/modules/bookings/`, `frontend/features/booking/`                                  | [Workflows](WORKFLOWS.md)                                            |
| Guest/payment/refund       | `backend/src/modules/payments/`, `frontend/features/payment/`                                  | [API](API.md), [guest recovery](GUEST-BOOKING-RECOVERY-CONTRACTS.md) |
| Check-in                   | `backend/src/modules/check-in/`                                                                | [Workflows](WORKFLOWS.md)                                            |
| Assistant                  | `backend/src/modules/ai-assistant/`, `frontend/features/ai-assistant/`                         | [Backend architecture](BACKEND-ARCHITECTURE.md)                      |
| Chính sách/privacy/support | Module tương ứng trong `backend/src/modules/`, các route legal/support/privacy phía web        | [Legal](LEGAL-AND-PRIVACY.md)                                        |
| Model/constraint           | `backend/prisma/schema.prisma`, `migrations/`                                                  | [Database](DATABASE.md)                                              |
| Env/startup                | `backend/src/main.ts`, `app.module.ts`, `backend/prisma.config.ts`, `frontend/next.config.mjs` | [Configuration](CONFIGURATION.md)                                    |
| Test/build/CI              | `package.json`, Jest configs, `.github/workflows/ci.yml`                                       | [Pipelines](PIPELINES.md)                                            |

## Ranh giới cần nhớ

Backend module sở hữu use case và persistence contract; frontend không tự quyết tiền/quyền/trạng thái. Courts public export schedule/pricing contract; Booking dùng transaction để giữ snapshot và occupancy. Payment/provider và queue không atomic với PostgreSQL.

Notifications có Socket.IO scaffold chưa nạp vào AppModule. User module có profile use cases; payment/check-in đã có implementation. Không dùng mô tả scaffold từ snapshot cũ để suy trạng thái hiện tại.

Tham chiếu sâu: [Architecture](ARCHITECTURE.md), [Backend](BACKEND-ARCHITECTURE.md), [Frontend](FRONTEND-ARCHITECTURE.md). Chỉ mở rộng phạm vi đọc/sửa khi có dependency cụ thể với task.
