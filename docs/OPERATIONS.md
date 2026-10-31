# Vận hành môi trường phát triển và chuẩn bị rollout

Backend Nest modular monolith và Next frontend có scripts ở package.json root. PostgreSQL đích do DATABASE_URL chọn; local mặc định là pickleball, Neon dùng database trong connection string. Prisma files ở backend/prisma, migration v1 dùng schema public.

## Các lệnh hệ thống

| Tác vụ                             | Command từ root                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Cài cây dependency khóa            | npm ci                                                                                        |
| PostgreSQL, Redis và Mailpit local | docker compose --env-file infra/.env -f infra/docker-compose.yml up -d postgres redis mailpit |
| Redis local khi DB là Neon         | docker compose --env-file infra/.env -f infra/docker-compose.yml up -d redis                  |
| Xem lịch sử migration ở DB đích    | npm run prisma:migrate:status                                                                 |
| Apply SQL migrations có sẵn        | npm run prisma:migrate:deploy                                                                 |
| Sinh client/types                  | npm run prisma:generate                                                                       |
| Chạy backend development           | npm run start:dev                                                                             |
| Chạy frontend development          | npm run web:dev                                                                               |
| Build API                          | npm run build                                                                                 |
| Build frontend                     | npm run build:web                                                                             |
| Dừng hạ tầng local, giữ volumes    | docker compose --env-file infra/.env -f infra/docker-compose.yml down                         |

## Phân vùng env

| Phạm vi          | Mẫu trong repo                                                 | File local            | Cách nạp                                                                                 |
| ---------------- | -------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| Backend / Prisma | Mẫu tại [Configuration](CONFIGURATION.md#backend-development)  | `backend/.env`        | Nest ConfigModule; Prisma config đọc khi chưa có `DATABASE_URL` trong process (trừ seed) |
| Frontend         | Mẫu tại [Configuration](CONFIGURATION.md#frontend-development) | `frontend/.env.local` | Next.js nạp từ thư mục `frontend/`                                                       |
| Hạ tầng dev      | Mẫu tại [Configuration](CONFIGURATION.md#hạ-tầng-local)        | `infra/.env`          | Dùng Compose `--env-file infra/.env` tường minh; alias tùy revision                      |
| E2E local        | Mẫu tại [Pipelines](PIPELINES.md#e2e-local-và-pre-hook)        | `backend/.env.test`   | Scripts test dùng `dotenv run --override` và Compose test dùng `--env-file` riêng        |

Một số revision còn `.env.example` legacy tại root; tài liệu mới dùng cấu hình phân theo thành phần tại [CONFIGURATION.md](CONFIGURATION.md). Tạo từng file local từ mẫu tương ứng nếu chưa có; không ghi đè cấu hình đang dùng. `NEXT_PUBLIC_*` đi vào bundle trình duyệt, tuyệt đối không đặt secret ở frontend. Các file local được Git ignore. Checkout có thể có mẫu example theo thành phần; các khối mẫu trong tài liệu không phụ thuộc việc những file example đó đã được commit.

**Chuyển từ cấu hình cũ:** chuyển biến API/DB/Redis/JWT/SMTP/provider/seed sang `backend/.env`, biến `NEXT_PUBLIC_*` sang `frontend/.env.local`, và `POSTGRES_*` dùng cho Docker dev sang `infra/.env`. Giữ `backend/.env.test` riêng. Đảm bảo user/password/database/port của `DATABASE_URL` khớp Compose local; đổi env không đổi credential trong volume PostgreSQL đã khởi tạo. Nếu dùng Neon, giữ nguyên URL của provider trong backend.

Nest và `frontend/next.config.mjs` vẫn có fallback đọc env root để tương thích setup cũ. Sau khi chuyển đủ biến, tự bỏ file env root cũ để tránh giá trị cũ tiếp tục được nạp; đặc biệt khi chạy `start:prod` từ root, Nest có thể ưu tiên file đó. Biến trong process thường ưu tiên file; scripts test có `--override` là ngoại lệ. Prisma CLI chỉ tự đọc `backend/.env`, không đọc env root. Khởi động lại backend/frontend sau khi đổi env; biến public cần build lại khi chạy production.

Seed và audit không tự nạp env. Khi chủ động chạy seed vào DB development/test đã chọn, đặt `SEED_ENABLED=true` và allowlist trong backend rồi nạp tường minh, ví dụ `npx --no-install dotenv run -f backend/.env -- npm run seed:courts`. Không commit file env local hoặc credential thật.

V1 là initial SQL cho DB/schema mới hoặc trống. DB có dữ liệu/bảng sẵn cần baseline/reconcile phù hợp trước apply; không dùng reset như thao tác vận hành mặc định. Không sửa migration đã apply, thêm migration mới cho thay đổi tiếp theo.

Build API hiện generate rồi compile; không apply migration. Runtime PrismaService kết nối DB, không tự tạo bảng. migrate deploy không tạo SQL mới hoặc sinh client. Development tạo migration mới bằng migrate dev trên môi trường phù hợp với shadow DB; release apply bằng migrate deploy.

Khi dùng Neon, giữ connection parameters/TLS mà provider cấp và chọn đúng branch/database. Thay `POSTGRES_DB` trong `infra/.env` chỉ ảnh hưởng hạ tầng local, không lựa chọn database Neon. Dùng role có quyền DDL/extensions cần thiết cho v1.

## Địa chỉ local

- Frontend: http://localhost:4001
- API: http://localhost:4000
- Swagger: http://localhost:4000/api/docs
- Mailpit: http://127.0.0.1:8025

## SMTP local bằng Mailpit

Mailpit nhận email để xem tại máy local, không chuyển thư đến hộp thư thật. Service dùng image chính thức được pin phiên bản, healthcheck và volume `mailpit_data` giữ mail qua các lần dừng/khởi động. Cổng SMTP 1025 và giao diện 8025 chỉ bind loopback.

Backend hiện chỉ có `start:dev`; không có script `start:dev:mailpit` hoặc file `infra/mailpit.env` được cung cấp sẵn. Sau khi cấu hình DB/Redis/JWT cho development, tạo một file **local, không commit** tên `backend/.env.mailpit.local` nếu muốn ghi đè riêng SMTP mà không thay cấu hình production. File này được rule `.env*` của Git ignore và chỉ cần chứa các giá trị không bí mật sau:

```dotenv
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_REQUIRE_TLS=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=no-reply@smasharena.test
```

Từ root chạy:

```powershell
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d postgres redis mailpit
npx --no-install dotenv run --override -f backend/.env.mailpit.local -- npm run start:dev
```

`dotenv` CLI có sẵn trong dependency của repository. `--override` đưa các khóa trong file SMTP local vào process trước khi Nest nạp cấu hình; DB/Redis/JWT không nằm trong file này nên vẫn dùng môi trường development hiện có. Cả `SMTP_USER` và `SMTP_PASSWORD` phải rỗng để không dùng thông tin xác thực SMTP cũ; chỉ xóa biến khỏi shell có thể khiến giá trị trong file env khác được nạp lại. `SMTP_FROM` phải là địa chỉ email thuần hợp lệ theo validation của backend. Cấu hình không TLS này chỉ dành cho local; không chạy với `NODE_ENV=production`.

Nếu đã cấu hình SMTP local trong môi trường development thì chạy trực tiếp `npm run start:dev`. Nếu đã chạy DB/Redis hoặc dùng DB khác, chỉ khởi động Mailpit bằng `npm run mailpit:up`. Chạy frontend ở terminal khác bằng `npm run web:dev`; dừng backend development cũ trước khi chạy backend mới để tránh trùng cổng API. Backend trên host dùng `127.0.0.1:1025`; nếu sau này backend chạy trong cùng Compose network thì hostname SMTP phải là `mailpit`, không phải loopback.

Mở http://127.0.0.1:8025, đăng ký tài khoản mới rồi gửi OTP từ màn hình xác minh email; dùng mã trong Mailpit để xác minh và đăng nhập. Tài khoản chưa xác minh khi đăng nhập đúng mật khẩu cũng được chuyển sang màn hình OTP. Chức năng quên mật khẩu gửi link reset vào cùng Mailpit. Các giới hạn gửi/TTL/CSRF hiện hành vẫn áp dụng; đăng ký vẫn cần HIBP truy cập được. Mailpit không làm phát sinh email cho mỗi lần đăng nhập thành công.

Kiểm tra container bằng `docker compose --env-file infra/.env -f infra/docker-compose.yml ps mailpit`. Dừng riêng Mailpit bằng `docker compose --env-file infra/.env -f infra/docker-compose.yml stop mailpit`; `docker compose --env-file infra/.env -f infra/docker-compose.yml down` dừng cả hạ tầng local và giữ volumes.

Sau build, production dùng `npm run start:prod` và SMTP provider có TLS theo [SECURITY.md](SECURITY.md); không nạp `backend/.env.mailpit.local`. Không nạp SMTP local vào production hoặc dùng Mailpit làm bằng chứng provider thực đã hoạt động. Cấu hình mặc định không bật relay/forwarding. Tham khảo [Docker Mailpit](https://mailpit.axllent.org/docs/install/docker/) và [SMTP mặc định](https://mailpit.axllent.org/docs/configuration/smtp/).

## Tiền kiểm chuẩn hóa điện thoại Auth

Migration [`20261013090000_normalize_auth_phone`](../backend/prisma/migrations/20261013090000_normalize_auth_phone/migration.sql) chuẩn hóa `users.phone` về `+84…` bằng regex trích từ metadata VN của `libphonenumber-js` 1.13.15; TypeScript helper và audit CLI dùng cùng biểu thức với hàm SQL. Trước khi deploy, chọn đúng `DATABASE_URL` trong môi trường đích và chạy `npm run auth:phones:audit`. Script chỉ đọc dữ liệu; output có số lượng và ID bản ghi lỗi/trùng, không in số điện thoại hoặc credential. Exit 1 nghĩa là cần xử lý dữ liệu trước khi migrate.

Không tự gộp, vô hiệu hóa tài khoản hoặc thêm hậu tố vào điện thoại khi collision. Sau khi xử lý có quyết định của người quản lý dữ liệu, chạy lại tiền kiểm. Backend tra cứu dạng nội địa và quốc tế trong giai đoạn chuyển đổi; tài khoản mới lưu dạng quốc tế.

Entrypoint duy nhất là [`backend/prisma/audit-auth-phones.mjs`](../backend/prisma/audit-auth-phones.mjs). Lệnh dùng `DATABASE_URL` đã truyền qua môi trường, không tự nạp `.env`; nếu cần nạp file đã chọn, dùng `node --env-file=backend/.env backend/prisma/audit-auth-phones.mjs`. Kiểm thử Jest dùng `npm run test:auth:phones`; phần migration/CLI chỉ chạy trên DB loopback riêng `auth_validation_test` qua `AUTH_MIGRATION_TEST_URL`, không dùng URL ứng dụng. CI đặt `AUTH_MIGRATION_REQUIRE_STORAGE=true` để thiếu URL phải thất bại.

Migration kiểm tra lại dữ liệu/collision trong transaction trước khi update, giữ nguyên số chuẩn và chạy lại không thay đổi kết quả. Migration giữ write lock ngắn trên `users` để ngăn ghi đồng thời giữa kiểm tra và update; lock timeout 5 giây và statement timeout 30 giây. Cần cửa sổ bảo trì phù hợp và backup đã kiểm chứng trước khi apply lên DB thật.

Đây là chuẩn hóa dữ liệu mất định dạng gốc: rollback transaction bảo vệ lần chạy lỗi, nhưng rollback sau khi commit cần phục hồi `users.phone` từ backup trước migration theo ID và kiểm tra unique. Không có lệnh DOWN tự suy đoán định dạng gốc. Migration đã được kiểm thử trên PostgreSQL riêng với dữ liệu giả lập; không suy ra đã apply vào DB ứng dụng.

## Phạm vi chức năng

Trước rollout hardening auth: cung cấp `WEB_ORIGIN` và `NEXT_PUBLIC_API_URL` HTTPS, đặt `AUTH_MAIL_MAX_PER_HOUR` theo quota provider; giữ proxy allowlist và Secure cookie theo topology hiện hành. JWT issuer/audience mới làm phiên cũ phải đăng nhập lại. Không rollback bằng cách tắt CSRF/validation/Secure hoặc flush Redis. Redis reconnect quá budget cần restart sau khi dịch vụ phục hồi; kiểm eviction/durability/ACL/TLS riêng. CSP frontend hiện enforced nhưng có `unsafe-inline`, `unsafe-eval` và nguồn HTTPS rộng; không coi là đã siết nonce/hash. Thay policy cần browser/edge verification. Release còn phụ thuộc xử lý/chấp nhận advisory bởi owner, storage thật, SMTP provider, audit retention/quyền đọc, backup/restore và review độc lập.

Schema hiện có 27 Prisma models; booking giữ chỗ/expiry/hủy dùng transaction bảo vệ giá/history/occupancy. [BOOKING-MVP.md](BOOKING-MVP.md) mô tả seed idempotent, migration khóa idempotency và DB test riêng. Payment/refund/check-in và guest checkout đã có use case/controller. Email booking/outbox delivery sink còn thiếu; provider, payout và check-in runtime cần nghiệm thu riêng. Trạng thái auth/API đọc ở [BACKEND-ARCHITECTURE.md](BACKEND-ARCHITECTURE.md) và [SECURITY.md](SECURITY.md).

Scaffold observability giữ cấu hình placeholder hiện hữu. Điều kiện startup và trạng thái migration của mỗi DB cần được xác minh trong môi trường đó; tài liệu/source không chứng minh DB đã được apply.

Nguồn: [Prisma CLI v7](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference), [Migration deployment](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/deploy-database-changes-with-prisma-migrate).
