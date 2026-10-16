# Build, test, migration và CI

Các lệnh chạy từ thư mục gốc repository. Script chuẩn là `package.json`; workflow CI hiện tại là `.github/workflows/ci.yml`.

## Lệnh thường dùng

| Mục tiêu                                      | Lệnh                            |
| --------------------------------------------- | ------------------------------- |
| Cài dependency theo lockfile                  | `npm ci`                        |
| Lint/type-aware lint                          | `npm run lint`                  |
| Unit test Jest                                | `npm test`                      |
| E2E Jest                                      | `npm run test:e2e`              |
| Build API (generate Prisma rồi Nest build)    | `npm run build`                 |
| Build frontend                                | `npm run build:web`             |
| Sinh Prisma client/types                      | `npm run prisma:generate`       |
| Xem trạng thái migration trên DB URL hiện tại | `npm run prisma:migrate:status` |
| Tạo migration trong môi trường dev            | `npm run prisma:migrate:dev`    |
| Apply migration đã tạo                        | `npm run prisma:migrate:deploy` |
| Khởi động PostgreSQL và Redis local           | `npm run infra:up`              |
| Dừng container local, giữ volume              | `npm run infra:down`            |

Yêu cầu Node nằm trong `.nvmrc` và `engines` của package. Prisma config ở `backend/prisma.config.ts`; lệnh Prisma phụ thuộc `DATABASE_URL`. Không đọc/ghi credential thật để chạy lệnh và không chạy migration lên môi trường không được chỉ định.

`npm run build` không apply migration. `migrate deploy` apply SQL hiện có nhưng không sinh client; `prisma:generate` không chứng minh schema đã được migrate. Xem [OPERATIONS.md](OPERATIONS.md) trước thao tác DB.

## CI hiện tại

Workflow chạy khi push hoặc pull request:

1. Cài Node theo `.nvmrc` và `npm ci`.
2. Generate Prisma client với `DATABASE_URL` placeholder.
3. Tạo service PostgreSQL/Redis disposable, migrate DB riêng `auth_security_test`; `AUTH_SECURITY_REQUIRE_STORAGE=true` buộc storage suite không được bỏ qua vì thiếu URL. Chạy `npm audit --audit-level=high`, focused source security gate, lint, unit/storage và HTTP/frontend auth checks. Local không có URL test vẫn skip storage; phải báo riêng.
4. Build API và frontend.

Workflow không deploy ứng dụng và không chứng minh DB ứng dụng/payment/provider hoạt động. URLs chỉ trỏ service containers CI; không fallback sang DATABASE_URL ứng dụng trong storage suite. Frontend build CI dùng HTTPS API placeholder, không chứng minh topology production. Actions checkout/setup-node được pin SHA; pin phải được xác minh với repository chính thức khi cập nhật. Scan errors/findings không được coi là clean. Dependency high chưa xử lý sẽ làm gate fail theo chủ đích.

## Dependency overrides cho security gate

`package.json` giới hạn override theo package cha đang kéo dependency có advisory; `package-lock.json` giữ phiên bản cài đặt cụ thể. Bản vá không thay ngưỡng `npm audit --audit-level=high` của CI.

| Package cha      | Dependency được override | Phiên bản đã kiểm chứng |
| ---------------- | ------------------------ | ----------------------- |
| `@prisma/config` | `deepmerge-ts`           | `8.0.2`                 |
| `prisma`         | `mysql2`                 | `3.24.6`                |
| `@nestjs/mau`    | `undici`                 | `6.29.0`                |
| `@nestjs/mau`    | `tmp`                    | `0.2.7`                 |

Các override này xử lý advisory của dependency bắc cầu mà không nâng major Prisma hoặc Nest. Khi upstream đã cập nhật dependency, thử bỏ override rồi chạy lại `npm ci`, `npm audit --audit-level=high`, Prisma generate, lint, test và build API/frontend trước khi loại bỏ hẳn. Không dùng `npm audit fix --force` để tự động downgrade Jest hoặc thay major ngoài phạm vi bản vá.

Audit ngày 2026-10-16 còn 20 cảnh báo moderate trong chuỗi Jest → `@istanbuljs/load-nyc-config` → `js-yaml` → `argparse` → `sprintf-js`; registry chưa có bản `sprintf-js` sửa [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). Không coi audit đạt ngưỡng high là không còn lỗ hổng; kiểm tra lại advisory khi cập nhật dependency.

## Pre-flight cho thay đổi

Booking MVP có suite `npm run test:booking:integration`. CI tạo DB `booking_mvp_test` riêng, migrate bằng `BOOKING_DATABASE_TEST_URL`, dùng `BOOKING_REDIS_TEST_URL` cho JWT/CSRF và `BOOKING_REQUIRE_STORAGE=true` để không bỏ qua storage. Core booking không dùng Redis lock/queue; auth vẫn cần Redis. Seed: `npm run seed:courts` với DATABASE_URL tường minh. Cách chạy PostgreSQL test riêng và contract tại [BOOKING-MVP.md](BOOKING-MVP.md).

- Chạy đúng lint/test/build cho vùng bị ảnh hưởng và báo riêng command, exit status, lỗi thuộc phạm vi nào.
- Với schema, xem diff cả `schema.prisma` và migration SQL; bảo toàn constraint thủ công. Kiểm tra trạng thái DB đích trước khi kết luận migration đã apply.
- Không sửa migration đã áp dụng; tạo migration mới theo môi trường dev phù hợp.
- Không dùng reset để xử lý DB có dữ liệu. Không commit `.env`, secret, generated output hoặc dữ liệu người dùng.
- Exit 0 của tool chỉ xác nhận command kết thúc thành công; không xác nhận nghiệp vụ, deployment hoặc dữ liệu production.
