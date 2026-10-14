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
3. Chạy `npm run lint`, `npm test`, kiểm tra HTTP/frontend auth và tiền kiểm điện thoại với dữ liệu giả lập. Test migration PostgreSQL bị skip khi chưa có DB test được chỉ định.
4. Build API và frontend.

Workflow này không khởi động database, không chứng minh runtime DB/payment/provider hoạt động và không deploy ứng dụng. Docker Compose chỉ khai báo PostgreSQL 16 và Redis 7 local.

## Pre-flight cho thay đổi

- Chạy đúng lint/test/build cho vùng bị ảnh hưởng và báo riêng command, exit status, lỗi thuộc phạm vi nào.
- Với schema, xem diff cả `schema.prisma` và migration SQL; bảo toàn constraint thủ công. Kiểm tra trạng thái DB đích trước khi kết luận migration đã apply.
- Không sửa migration đã áp dụng; tạo migration mới theo môi trường dev phù hợp.
- Không dùng reset để xử lý DB có dữ liệu. Không commit `.env`, secret, generated output hoặc dữ liệu người dùng.
- Exit 0 của tool chỉ xác nhận command kết thúc thành công; không xác nhận nghiệp vụ, deployment hoặc dữ liệu production.
