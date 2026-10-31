# Build, kiểm thử và CI

Chạy lệnh từ root repository. Nguồn chuẩn là [package.json](../package.json), cấu hình Jest và [CI workflow](../.github/workflows/ci.yml). Kiểm tra script cùng pre/post-hook trước khi chạy. Đây là hướng dẫn kiểm chứng, không phải log PASS cho revision hiện tại.

## Kiểm tra không cần storage ngoài

| Lệnh                           | Phạm vi                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `npm run lint`                 | Oxlint type-aware cho backend/frontend                       |
| `npm test`                     | `test:backend` rồi `test:frontend`                           |
| `npm run test:backend`         | Unit config; loại integration suites                         |
| `npm run test:frontend`        | Jest frontend; rendering JSDOM và HTTP mock                  |
| `npm run test:auth:contract`   | Nest HTTP contract và frontend validation/network            |
| `npm run test:auth:security`   | Auth HTTP với dependencies mô phỏng, không phải storage thật |
| `npm run test:frontend:ui`     | Rendering specs trong JSDOM                                  |
| `npm run test:auth:ui`         | Rendering auth                                               |
| `npm run test:booking:ui`      | Rendering booking                                            |
| `npm run test:backend:runtime` | Nest ESM/throttler HTTP runtime regression                   |

Unit config backend tại `backend/jest.unit.config.js`; frontend tại `frontend/jest.config.js`; integration/HTTP backend tại `backend/jest.config.js`. Không gọi rendering test là browser E2E.

## Storage integration riêng

| Lệnh                                       | Môi trường bắt buộc                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `npm run test:auth:storage`                | `AUTH_SECURITY_DATABASE_TEST_URL`, `AUTH_SECURITY_REDIS_TEST_URL`                                     |
| `npm run test:booking:integration`         | `BOOKING_DATABASE_TEST_URL`, `BOOKING_REDIS_TEST_URL`                                                 |
| `npm run test:booking:deposit:integration` | `BOOKING_DEPOSIT_DATABASE_TEST_URL`, DB loopback rỗng `booking_deposit_test`                          |
| `npm run test:auth:phones`                 | Có unit; phần migration/CLI opt-in bằng `AUTH_MIGRATION_TEST_URL`, DB loopback `auth_validation_test` |
| `npm run test:payments:integration`        | Đọc guard/môi trường của suite `backend/test/payments-coordinator.integration.spec.ts` trước khi chạy |

Các suite có guard/REQUIRE_STORAGE riêng; thiếu URL có thể SKIP hoặc FAIL theo chế độ. SKIP không phải PASS của storage. Không fallback sang DB ứng dụng. Suite phone tạo lại bảng users trong DB test riêng; deposit replay SQL lịch sử và từ chối target không rỗng. Không chạy hai bản suite cùng DB hoặc sử dụng lại DB ứng dụng.

Xem [Booking MVP](BOOKING-MVP.md) cho booking integration và [Operations](OPERATIONS.md#tiền-kiểm-chuẩn-hóa-điện-thoại-auth) cho phone audit. Cấu hình seed/test không tự cấp quyền migrate hay xóa dữ liệu.

## E2E local và pre-hook

`npm run test:e2e` có `pretest:e2e` gọi `db:test:restart`. Chuỗi này dừng/xóa hai container test, tạo lại, đợi readiness rồi apply migrations. Nó giữ volumes; không tương đương DB sạch.

Storage test dùng `test-database` cổng mặc định `5435`, `test-redis` cổng `6381` và volumes riêng. Tạo `backend/.env.test` với các giá trị local sau, không dùng URL dev/production:

```dotenv
NODE_ENV=test
POSTGRES_USER=pickleball
POSTGRES_PASSWORD=local_test_password
POSTGRES_DB=pickleball_test
TEST_POSTGRES_PORT=5435
DATABASE_URL=postgresql://pickleball:local_test_password@localhost:5435/pickleball_test?schema=public
REDIS_URL=redis://localhost:6381
REDIS_HOST=localhost
REDIS_PORT=6381
REDIS_PASSWORD=
```

E2E/migration test nạp file bằng `dotenv run --override`; file test ưu tiên biến process. Cấu hình bắt buộc khác như JWT/SMTP phải đáp ứng bootstrap nếu suite dùng AppModule thật. Các dedicated integration suite ở bảng trên dùng URL riêng, không tự dùng `.env.test`.

## Build và migration

| Lệnh                            | Tác động                                              |
| ------------------------------- | ----------------------------------------------------- |
| `npm run prisma:generate`       | Sinh client/types, không migrate                      |
| `npm run prisma:migrate:status` | Đọc trạng thái DB đã chọn                             |
| `npm run prisma:migrate:dev`    | Tạo/apply migration development; có yêu cầu shadow DB |
| `npm run prisma:migrate:deploy` | Apply SQL có sẵn vào DB đã chọn, không sinh client    |
| `npm run build`                 | Generate client rồi Nest build                        |
| `npm run build:web`             | Next production build; API origin HTTPS hợp lệ        |

Build cần Prisma config/DATABASE_URL nhưng không phải lệnh migrate. Không dùng reset để sửa DB có dữ liệu. Setup hạ tầng và env xem [Getting started](GETTING-STARTED.md) và [Configuration](CONFIGURATION.md). Alias `infra:*` có thể khác file env giữa các revision; hướng dẫn mới dùng Compose `--env-file infra/.env` tường minh.

## CI hiện tại

Workflow chạy khi push/pull request, dùng Node theo `.nvmrc`, npm ci, PostgreSQL/Redis disposable. Các nhóm step gồm:

1. Nest/throttler runtime regression và Prisma generate.
2. Migration vào DB auth test, tạo/migrate booking test; kiểm upgrade deposit và phone migration riêng.
3. Auth storage, booking integration và booking UI trên runner UTC.
4. `npm audit --audit-level=high`, `node tools/security-source-check.mjs`, lint và unit tests.
5. Auth contract/security/rendering/phone checks; build API và frontend.

CI bật REQUIRE_STORAGE cho các suite tương ứng để thiếu môi trường phải fail. Workflow không tự deploy, không gọi merchant bank thật và chưa bao phủ mọi flow có trong source. Frontend build dùng HTTPS API placeholder; không chứng minh topology production. Xem log run đúng commit trước khi báo CI PASS.

## Dependency và báo cáo

Manifest có override bắc cầu theo package cha; lockfile giữ cây đã cài. Không ghi advisory đã hết chỉ từ ngày audit cũ hoặc threshold high. Khi thay override, kiểm tra diff và chạy đúng audit/generate/lint/tests/build liên quan; không dùng `npm audit fix --force` để đổi major ngoài scope.

Mỗi kết quả cần command, revision, môi trường/mock/storage và observed result. Browser, storage, unit và provider là evidence khác nhau. Thay đổi chỉ tài liệu dùng kiểm tra link/command/contract/Markdown; không bắt buộc chạy app suite hoặc migrate để chứng minh prose đúng.
