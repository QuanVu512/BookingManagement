# Tech stack modular monolith

Ngày tra cứu phiên bản: 2026-10-08. Các con số trong `package.json` là phiên bản gốc đã kiểm tra; tiền tố `~` cho phép cập nhật patch trong cùng minor.

## Lựa chọn

| Phần     | Công nghệ                                                                                    | Phiên bản khai báo     | Tình trạng                                              |
| -------- | -------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------- |
| Frontend | [Next.js](https://www.npmjs.com/package/next) + [React](https://www.npmjs.com/package/react) | `~16.4.0`, `~19.3.0`   | Scaffold App Router tại `frontend/`                     |
| Backend  | [NestJS](https://www.npmjs.com/org/nestjs) + Express adapter                                 | `~12.1.2`              | Một NestJS backend chia module                          |
| Runtime  | [Node.js 24 LTS](https://nodejs.org/en/about/previous-releases)                              | `>=24.15.0 <25`        | Mức tối thiểu đáp ứng Nest CLI/Schematics 12 và runtime |
| Ngôn ngữ | TypeScript                                                                                   | `~6.0.3`               | Giữ major 6 theo hướng dẫn Nest 12                      |
| Kiểm thử | [Jest](https://www.npmjs.com/package/jest) + ts-jest                                         | `~30.5.2`, `~29.4.14`  | ESM được cấu hình dùng Node VM modules; Node 24.21      |
| Lint     | Oxlint + tsgolint                                                                            | `~1.87.0`, `~7.0.2003` | Type-aware lint cho API và frontend                     |
| Format   | Prettier                                                                                     | `~3.9.9`               | Đang dùng                                               |

## Dependency versions

Các phiên bản package nằm trong [package.json](../package.json), dependency tree được khóa trong [package-lock.json](../package-lock.json); image hạ tầng nằm trong [Compose](../infra/docker-compose.yml). Các package tích hợp NestJS được căn theo major 12. Next.js 16.4.0 đi cùng React 19.3.0. Prisma CLI, Client và PostgreSQL adapter dùng chung bản 7.10.0 stable; Prisma 8 đang là release candidate khi tra cứu. BullMQ dùng integration Nest 12. Node được pin `24.21.0` ở `.nvmrc`; engine range `>=24.15.0 <25` đáp ứng Nest CLI/Schematics và Jest ESM. `@nestjs/mau` vẫn nằm trong dependency do script `nest deploy` hiện hữu.

## Range và lockfile

- `~1.2.3` cho phép phiên bản `>=1.2.3 <1.3.0`, tức nhận patch fixes nhưng không tự nhận minor hoặc major. `^1.2.3` có thể lên các minor trong major 1 nên không khớp chính sách này.
- Với gói `0.x`, `~0.3.2` vẫn khóa minor và nhận patch trong `0.3.x`.
- `package-lock.json` khóa cây dependency chính xác để cài đặt tái lập. Chỉ đổi `~` trong `package.json` không làm bản đã khóa tự thay đổi; chạy `npm update` để chủ động nhận các bản patch phù hợp, sau đó kiểm tra diff lockfile.
- Không dùng tag `latest`, prerelease, wildcard hoặc `*` trong manifest. Nâng minor/major cần task và kiểm tra tương thích riêng.

## Nguồn chính

- [NestJS migration guide](https://docs.nestjs.com/migration-guide) — yêu cầu Node cho app/CLI, Nest 12 ESM và nâng TypeScript lên v6.
- [NestJS release history](https://github.com/nestjs/nest/releases) và [NestJS package registry](https://www.npmjs.com/org/nestjs) — phiên bản framework.
- [Next.js package](https://www.npmjs.com/package/next) — phiên bản và peer dependencies; [Next.js docs](https://nextjs.org/docs) — tài liệu framework.
- [React](https://www.npmjs.com/package/react), [React DOM](https://www.npmjs.com/package/react-dom), [React types](https://www.npmjs.com/package/@types/react), [React DOM types](https://www.npmjs.com/package/@types/react-dom) — package versions.
- [TypeScript](https://www.npmjs.com/package/typescript), [Jest](https://www.npmjs.com/package/jest), [ts-jest](https://www.npmjs.com/package/ts-jest), [Oxlint](https://www.npmjs.com/package/oxlint), [tsgolint](https://www.npmjs.com/package/oxlint-tsgolint), [Prettier](https://www.npmjs.com/package/prettier) — tool versions.
- [Node.js 24.21.0 archive](https://nodejs.org/en/download/archive/v24.21.0) — runtime pin; [NestJS first steps](https://docs.nestjs.com/first-steps) — runtime requirements.
- [npm semver ranges](https://docs.npmjs.com/cli/v6/using-npm/semver/), [npm install and lockfile behavior](https://docs.npmjs.com/cli/install/), [package-lock format](https://docs.npmjs.com/files/package-lock.json/) — range và lockfile semantics.

## Kiến trúc và phạm vi scaffold

Next tại frontend/, Nest modular monolith tại backend/src/modules theo Controller → Service → Repository. Root manifest/lockfile chung. Không có năm apps hay API gateway riêng; không dùng Nest apps/libs.

Một DB PostgreSQL pickleball/schema public.21 business models và OutboxEvent trong backend/prisma/schema.prisma; migration v1 tại backend/prisma/migrations/20261009000100_v1_initial/migration.sql, chưa apply.

Redis/BullMQ cho cache/lock/jobs; Socket.IO trong Notifications module. RabbitMQ/gRPC là kiến thức mở rộng, chưa thuộc runtime bắt buộc. Jest kiểm tra code, k6 đo tải.

Versions giữ nguyên. Nest CLI và tsconfig.build ở backend, Compose ở infra/docker-compose.yml, k6 ở tests/load. Dotenv đọc.env root bằng path rõ. Lượt này chưa cài dependency, apply DB, generate client, build/test hoặc deploy.

Auth cơ bản có đăng ký, đăng nhập, đọc phiên và đăng xuất; phạm vi và giới hạn tại [SECURITY.md](SECURITY.md). Chưa có booking/payment/refund/check-in workflows. Mốc hủy/check-in, rounding và merchant payout còn cần chốt khi implement. Models và migration không tự làm các luồng chạy.

Đọc [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE-DESIGN.md](DATABASE-DESIGN.md) và [OPERATIONS.md](OPERATIONS.md). Học liệu cá nhân nằm trong guide/ và không publish cùng repo.
