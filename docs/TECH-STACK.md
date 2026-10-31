# Công nghệ và phiên bản

Tham chiếu version từ manifest/lockfile của repository; không phải danh sách phiên bản mới nhất trên registry. Cài bằng `npm ci` để tái lập dependency đã khóa.

## Stack

| Thành phần     | Công nghệ                    | Khai báo trong manifest                         |
| -------------- | ---------------------------- | ----------------------------------------------- |
| Runtime        | Node.js                      | `>=24.15.0 <25`; pin tại `.nvmrc`: `24.21.0`    |
| Frontend       | Next.js / React / React DOM  | `~16.4.2` / `~19.3.0` / `~19.3.0`               |
| Backend        | NestJS / Express adapter     | Nest core/common `~12.1.2`                      |
| Ngôn ngữ       | TypeScript                   | `~6.0.3`                                        |
| Persistence    | Prisma CLI/client/adapter-pg | `~7.10.0`                                       |
| Database local | PostgreSQL                   | Compose `postgres:16.11-alpine`                 |
| Session/jobs   | Redis / BullMQ               | Compose `redis:7.4.11-alpine`; BullMQ `~6.3.11` |
| Mail local     | Mailpit                      | Compose `axllent/mailpit:v1.31.6`               |
| Payment SDK    | `@payos/node`                | `~2.0.5`                                        |
| Kiểm thử       | Jest / ts-jest / JSDOM       | `~30.5.2` / `~29.4.14` / `30.1.2`               |
| Lint           | Oxlint / tsgolint            | `~1.87.0` / `~7.0.2003`                         |
| Format         | Prettier                     | `~3.9.9`                                        |

Nguồn: [manifest](../package.json), [lockfile](../package-lock.json), [runtime pin](../.nvmrc), [Compose](../infra/docker-compose.yml). CI dùng service images theo [workflow](../.github/workflows/ci.yml), không nhất thiết trùng patch image local.

## Vai trò runtime

Next.js App Router cung cấp giao diện; NestJS chạy một API chia module và worker. Prisma truy cập một PostgreSQL database; Redis phục vụ session, CSRF, rate limit và BullMQ. Auth SMTP gửi OTP/reset; Mailpit nhận thư local. payOS adapter cần cấu hình được cấp riêng.

Socket.IO có dependency/scaffold nhưng chưa nối vào luồng booking. RabbitMQ và gRPC không phải runtime bắt buộc. Frontend dùng CSS/CSS Modules, không khai báo Tailwind hoặc global state library riêng. Trợ lý có knowledge/static provider; dependency/module không chứng minh model AI ngoài được kết nối.

## Version và lockfile

`~1.2.3` nhận patch trong minor `1.2`; `^1.2.3` có thể nhận minor trong major `1`. Manifest hiện có cả hai loại range; lockfile quyết định dependency thực cài bằng `npm ci`. Không mô tả tất cả dependency là patch-only.

Đổi minor/major hoặc override cần diff manifest/lockfile và kiểm tra tương thích theo phạm vi. Không tự dùng `npm audit fix --force` hoặc tag `latest` để xử lý advisory. Audit threshold của CI không phải chứng nhận không có lỗ hổng.

## Build và test

Nest/Jest chạy ESM; các script Jest dùng Node VM modules. Backend unit và frontend Jest có config riêng; integration/storage cần URL test riêng. `build` sinh Prisma client rồi compile, không migrate DB. Frontend production build yêu cầu API origin HTTPS hợp lệ. Xem [PIPELINES.md](PIPELINES.md).

Cấu hình env tại [CONFIGURATION.md](CONFIGURATION.md); topology tại [ARCHITECTURE.md](ARCHITECTURE.md). Version được công bố ở đây mô tả repository, không chứng minh dependency đã được cài hoặc app đã chạy ở một máy cụ thể.
