# Vận hành bộ khung hiện tại

Backend Nest modular monolith và Next frontend có scripts ở package.json root. PostgreSQL đích do DATABASE_URL chọn; local mặc định là pickleball, Neon dùng database trong connection string. Prisma files ở backend/prisma, migration v1 dùng schema public.

## Các lệnh hệ thống

| Tác vụ                          | Command từ root                                                        |
| ------------------------------- | ---------------------------------------------------------------------- |
| Cài cây dependency khóa         | npm ci                                                                 |
| PostgreSQL và Redis local       | npm run infra:up                                                       |
| Redis local khi DB là Neon      | docker compose --env-file .env -f infra/docker-compose.yml up -d redis |
| Xem lịch sử migration ở DB đích | npm run prisma:migrate:status                                          |
| Apply SQL migrations có sẵn     | npm run prisma:migrate:deploy                                          |
| Sinh client/types               | npm run prisma:generate                                                |
| Chạy backend development        | npm run start:dev                                                      |
| Chạy frontend development       | npm run web:dev                                                        |
| Build API                       | npm run build                                                          |
| Build frontend                  | npm run build:web                                                      |
| Dừng hạ tầng local, giữ volumes | npm run infra:down                                                     |

.env root được tạo từ.env.example nếu chưa có. Prisma CLI đọc backend/prisma.config.ts; Nest/Next có cấu hình đọc env root. Không commit.env hoặc credential thật.

V1 là initial SQL cho DB/schema mới hoặc trống. DB có dữ liệu/bảng sẵn cần baseline/reconcile phù hợp trước apply; không dùng reset như thao tác vận hành mặc định. Không sửa migration đã apply, thêm migration mới cho thay đổi tiếp theo.

Build API hiện generate rồi compile; không apply migration. Runtime PrismaService kết nối DB, không tự tạo bảng. migrate deploy không tạo SQL mới hoặc sinh client. Development tạo migration mới bằng migrate dev trên môi trường phù hợp với shadow DB; release apply bằng migrate deploy.

Khi dùng Neon, giữ connection parameters/TLS mà provider cấp và chọn đúng branch/database. Thay POSTGRES_DB trong.env chỉ ảnh hưởng hạ tầng local, không lựa chọn database Neon. Dùng role có quyền DDL/extensions cần thiết cho v1.

## Địa chỉ local

- Frontend: http://localhost:4001
- API: http://localhost:4000
- Swagger: http://localhost:4000/api/docs

## Tiền kiểm chuẩn hóa điện thoại Auth

Migration [`20261013090000_normalize_auth_phone`](../backend/prisma/migrations/20261013090000_normalize_auth_phone/migration.sql) chuẩn hóa `users.phone` về `+84…` theo metadata VN của `libphonenumber-js` 1.13.15. Trước khi deploy, chọn đúng `DATABASE_URL` trong môi trường đích và chạy `npm run auth:phones:audit`. Script chỉ đọc dữ liệu; output có số lượng và ID bản ghi lỗi/trùng, không in số điện thoại hoặc credential. Exit 1 nghĩa là cần xử lý dữ liệu trước khi migrate.

Không tự gộp, vô hiệu hóa tài khoản hoặc thêm hậu tố vào điện thoại khi collision. Sau khi xử lý có quyết định của người quản lý dữ liệu, chạy lại tiền kiểm. Backend tra cứu dạng nội địa và quốc tế trong giai đoạn chuyển đổi; tài khoản mới lưu dạng quốc tế.

Migration kiểm tra lại dữ liệu/collision trong transaction trước khi update, giữ nguyên số chuẩn và chạy lại không thay đổi kết quả. Migration giữ write lock ngắn trên `users` để ngăn ghi đồng thời giữa kiểm tra và update; lock timeout 5 giây và statement timeout 30 giây. Cần cửa sổ bảo trì phù hợp và backup đã kiểm chứng trước khi apply lên DB thật.

Đây là chuẩn hóa dữ liệu mất định dạng gốc: rollback transaction bảo vệ lần chạy lỗi, nhưng rollback sau khi commit cần phục hồi `users.phone` từ backup trước migration theo ID và kiểm tra unique. Không có lệnh DOWN tự suy đoán định dạng gốc. Migration đã được kiểm thử trên PostgreSQL riêng với dữ liệu giả lập; không suy ra đã apply vào DB ứng dụng.

## Phạm vi chức năng

Trước rollout hardening auth: cung cấp `WEB_ORIGIN` và `NEXT_PUBLIC_API_URL` HTTPS, đặt `AUTH_MAIL_MAX_PER_HOUR` theo quota provider; giữ proxy allowlist và Secure cookie theo topology hiện hành. JWT issuer/audience mới làm phiên cũ phải đăng nhập lại. Không rollback bằng cách tắt CSRF/validation/Secure hoặc flush Redis. Redis reconnect quá budget cần restart sau khi dịch vụ phục hồi; kiểm eviction/durability/ACL/TLS riêng. CSP giữ Report-Only cho tới khi browser/edge verification đạt. Release còn phụ thuộc xử lý/chấp nhận advisory bởi owner, storage thật, SMTP provider, audit retention/quyền đọc, backup/restore và review độc lập.

Repo có22 Prisma models và migration v1; workflows booking/payment/refund/check-in/email chưa implement. Trạng thái auth/API đọc ở [BACKEND-ARCHITECTURE.md](BACKEND-ARCHITECTURE.md) và [SECURITY.md](SECURITY.md). Không có seeding chi nhánh/sân trong v1. Tính occupied_until theo giờ chơi/buffer và các invariant xuyên nhiều row cần application transaction khi triển khai.

Scaffold observability giữ cấu hình placeholder hiện hữu. Điều kiện startup và trạng thái migration của mỗi DB cần được xác minh trong môi trường đó; tài liệu/source không chứng minh DB đã được apply.

Nguồn: [Prisma CLI v7](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference), [Migration deployment](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/deploy-database-changes-with-prisma-migrate).
