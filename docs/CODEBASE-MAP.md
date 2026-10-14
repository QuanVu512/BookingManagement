# Bản đồ codebase

Tài liệu này định vị nhanh các vùng chính của repository. Dùng nó để chọn file cần đọc; cấu trúc và mức triển khai có thể đổi theo code thực tế.

## Cây thư mục

```text
booking-project/
├── backend/
│   ├── src/
│   │   ├── modules/             # Auth, users, courts, bookings, payments, check-in, notifications
│   │   ├── infrastructure/      # Prisma, Redis, BullMQ
│   │   ├── app.module.ts        # Lắp module, rate limit, observability
│   │   └── main.ts              # Bootstrap, CORS, Swagger, listen
│   ├── prisma/
│   │   ├── schema.prisma        # Nguồn model và enum
│   │   └── migrations/          # SQL migration có version
│   └── test/                    # E2E Jest
├── frontend/
│   ├── app/                     # Next.js App Router
│   ├── components/              # UI theo feature
│   ├── context/                 # AuthContext
│   └── types/                   # Kiểu dùng ở frontend
├── infra/docker-compose.yml     # PostgreSQL và Redis local
├── tests/load/                  # Smoke/load script
├── docs/                        # Tài liệu hệ thống public
├── .github/workflows/           # CI
├── package.json                 # Scripts và dependency chung
└── package-lock.json            # Cây dependency đã khóa
```

`backend/src/generated/prisma/`, `backend/dist/`, `frontend/.next/`, `node_modules/` và `.temp/` là vùng sinh tự động, cache hoặc tạm; không dùng làm nguồn thiết kế. `guide/` là học liệu local. `coordination/` là lịch sử điều phối, không phải tài liệu sản phẩm.

## Ownership

| Vùng                          | Trách nhiệm                                                  |
| ----------------------------- | ------------------------------------------------------------ |
| `frontend/app/`               | Route, layout và trang Next.js                               |
| `frontend/components/`        | Thành phần giao diện theo feature                            |
| `frontend/context/`           | State dùng chung phía client, hiện có auth và guest UI state |
| `backend/src/modules/`        | Ranh giới module nghiệp vụ và HTTP                           |
| `backend/src/infrastructure/` | Kết nối Prisma, Redis và BullMQ                              |
| `backend/prisma/`             | Schema và lịch sử SQL migration                              |
| `infra/`                      | Cấu hình dịch vụ local bằng Docker Compose                   |
| `tests/load/`                 | Kiểm tra tải/smoke riêng, không phải unit test               |
| `docs/`                       | Đặc tả, kiến trúc và hướng dẫn vận hành                      |

## Quick jump

| Nhu cầu                     | Điểm bắt đầu                                                           | Tình trạng cần nhớ                                                                      |
| --------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Đăng nhập/JWT               | `backend/src/modules/auth/`                                            | Controller và service có luồng login/register/me/logout; xem [SECURITY.md](SECURITY.md) |
| Hồ sơ người dùng            | `backend/src/modules/users/`                                           | Module còn scaffold; xem [BACKEND-ARCHITECTURE.md](BACKEND-ARCHITECTURE.md)             |
| Danh sách sân               | `backend/src/modules/courts/`                                          | Có endpoint public; UI ở `frontend/app/page.tsx`                                        |
| Đặt sân/giữ chỗ             | `backend/src/modules/bookings/`, schema `Booking` và `CourtOccupancy`  | Module backend chưa có workflow; xem [WORKFLOWS.md](WORKFLOWS.md)                       |
| Thanh toán/hoàn tiền        | `backend/src/modules/payments/`, schema `Payment*` và `Refund*`        | Module chưa có workflow                                                                 |
| Check-in                    | `backend/src/modules/check-in/` và schema `BookingCheckin`             | Module chưa có workflow                                                                 |
| Giao diện đăng nhập/đăng ký | `frontend/components/auth/`, `frontend/context/auth-context.tsx`       | Client gọi Nest API qua `NEXT_PUBLIC_API_URL`                                           |
| Cơ sở dữ liệu               | `backend/prisma/schema.prisma`, `backend/prisma/migrations/`           | Xem [DATABASE.md](DATABASE.md); migration cần đối chiếu DB đích                         |
| Pipeline và lệnh            | `package.json`, `.github/workflows/ci.yml`, `infra/docker-compose.yml` | Xem [PIPELINES.md](PIPELINES.md)                                                        |

## Tài liệu theo miền

- [Backend](BACKEND-ARCHITECTURE.md) · [Frontend](FRONTEND-ARCHITECTURE.md)
- [Cơ sở dữ liệu](DATABASE.md) · [Bảo mật](SECURITY.md)
- [Workflow](WORKFLOWS.md) · [Pipeline](PIPELINES.md)
- Tài liệu tham chiếu chi tiết: [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE-DESIGN.md](DATABASE-DESIGN.md), [PROJECT.md](PROJECT.md), [TECH-STACK.md](TECH-STACK.md), [OPERATIONS.md](OPERATIONS.md).
