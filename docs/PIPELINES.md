# Build, test, migration và CI

Các lệnh chạy từ thư mục gốc repository. Script chuẩn là `package.json`; workflow CI hiện tại là `.github/workflows/ci.yml`.

## Lệnh thường dùng

| Mục tiêu                                      | Lệnh                            |
| --------------------------------------------- | ------------------------------- |
| Cài dependency theo lockfile                  | `npm ci`                        |
| Lint/type-aware lint                          | `npm run lint`                  |
| Unit test backend + frontend Jest             | `npm test`                      |
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

## Storage riêng cho E2E local

Dev dùng services `postgres` (cổng 5433 mặc định) và `redis` (6380). E2E dùng `test-database` (5435 mặc định) và `test-redis` (6381), với volumes `test_postgres_data` và `test_redis_data` riêng. Database có thể cùng tên ở hai PostgreSQL instance; dữ liệu vẫn độc lập.

Tạo `backend/.env.test` local (được Git ignore) với `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` và `DATABASE_URL` khớp nhau. Ví dụ chỉ dùng cho local:

```dotenv
NODE_ENV=test
POSTGRES_USER=pickleball
POSTGRES_PASSWORD=local_dev_password
POSTGRES_DB=pickleball
DATABASE_URL=postgresql://pickleball:local_dev_password@localhost:5435/pickleball?schema=public
REDIS_URL=redis://localhost:6381
REDIS_HOST=localhost
REDIS_PORT=6381
REDIS_PASSWORD=
```

Chạy `npm run test:e2e`. Hook `pretest:e2e` dừng/xóa riêng hai container test, tạo lại và đợi healthcheck, rồi apply migrations hiện có vào DB test. Restart giữ volumes và dữ liệu, không reset database. Dev vẫn dùng `npm run infra:up` hoặc `npm run db:dev:restart`; không chạy `infra:down` nếu muốn giữ các container dev hoạt động.

Migration test và lệnh E2E nạp `backend/.env.test` trực tiếp bằng `dotenv run --override -f backend/.env.test -- ...`, ưu tiên file này hơn biến môi trường đang có. CLI này có sẵn trong dependency `dotenv` của dự án. Khai báo cả `REDIS_URL` và `REDIS_HOST`/`REDIS_PORT` vì RedisService và BullMQ đọc các trường khác nhau. Các cấu hình ứng dụng khác vẫn theo ConfigModule hiện hành. Nếu đổi cổng PostgreSQL, cập nhật `TEST_POSTGRES_PORT` và `DATABASE_URL` trong file test cho khớp.

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

## Phân vùng test và tiện ích

`npm test` chạy `test:backend` (src unit và audit phone, loại integration) rồi `test:frontend` (`frontend/__tests__/`, config độc lập, rendering JSDOM và fetch mock), không cần service ngoài. `test:auth:contract` gọi riêng backend HTTP và frontend validation/network. Các alias UI theo feature vẫn được giữ.

`npm run test:auth:security` chạy riêng `auth-security.http.integration.spec.ts` bằng `--runTestsByPath`; CI gọi lệnh này trong step `Auth HTTP, frontend and phone audit checks`. Suite dựng Nest HTTP server thật trên loopback với DB/Redis/mail mô phỏng, giữ real timers và deadline phản hồi production 3500 ms; timeout test riêng là 30 giây. `test:backend` và `test:watch` dùng unit config nên không thu nhận suite này. Auth và audit dùng regex chuẩn hóa đồng bộ với migration SQL; `libphonenumber-js` không còn là direct dependency mà chỉ có thể còn trong `node_modules` như transitive dependency của `class-validator`, không import trên luồng Auth.

Storage auth chạy riêng bằng `npm run test:auth:storage`; booking dùng `test:booking:integration`. `test:auth:phones` dùng Jest; phần DB/CLI chỉ chạy khi có `AUTH_MIGRATION_TEST_URL`, buộc URL loopback và DB `auth_validation_test` riêng vì suite tạo lại bảng users. CI tạo DB này và đặt `AUTH_MIGRATION_REQUIRE_STORAGE=true`, thiếu URL phải fail. Không fallback sang DATABASE_URL ứng dụng.

Seed ở `backend/prisma/seed.mjs`, khai báo `migrations.seed` trong Prisma config bằng file URL được encode; từ root chạy `npm run seed:courts`, từ backend chạy `npx prisma db seed --config prisma.config.ts`. Cả hai yêu cầu DATABASE_URL tường minh; seed không tự chạy cùng migrate. Audit chỉ đọc nằm ở `backend/prisma/audit-auth-phones.mjs`; `npm run auth:phones:audit` dùng URL từ môi trường (có thể nạp file đã chọn bằng Node --env-file), không tự chọn DB. Security gate cấp repo nằm ở `tools/security-source-check.mjs`.
