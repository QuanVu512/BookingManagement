# Pickleball Booking

Next.js frontend và NestJS modular monolith. Backend dùng một PostgreSQL database do DATABASE_URL chọn; Redis/BullMQ cho tác vụ nền và Socket.IO cho realtime. Root package.json/package-lock.json quản lý dependency chung.

## Tài liệu hệ thống

- [Danh mục docs](docs/README.md)
- [Kiến trúc và ownership](docs/ARCHITECTURE.md)
- [Data dictionary](docs/DATABASE-DESIGN.md)
- [Tech stack](docs/TECH-STACK.md)
- [Commands vận hành](docs/OPERATIONS.md)

Học liệu cá nhân, lab, giáo trình và bản copy Sheet nằm trong guide/ được Git ignore. docs/ chứa tài liệu hệ thống publish cùng repo. Prisma schema/migration ứng dụng thuộc backend/prisma và cần commit.

## Khởi động bộ khung

Cần Node theo.nvmrc, npm và PostgreSQL/Redis tương ứng cấu hình. Nếu chưa có.env, tạo từ.env.example và cấu hình URL DB đích. Với DB/schema development mới hoặc trống:

```powershell
npm ci
npm run prisma:migrate:deploy
npm run prisma:generate
npm run start:dev
```

PostgreSQL/Redis local: npm run infra:up trước migration/start. Nếu DB là Neon, khởi động Redis local theo OPERATIONS; không cần PostgreSQL local. Terminal thứ hai chạy npm run web:dev.

Build API sinh client rồi compile; không tự migrate DB. DB có bảng/dữ liệu sẵn cần baseline phù hợp trước apply v1.

## Phạm vi hiện tại

Mốc đầu tiên là auth cơ bản: đăng ký, đăng nhập bằng username/email/điện thoại, đọc phiên và đăng xuất; frontend có form validation, modal và cookie HTTP-only do API quản lý. Backend lưu tài khoản bằng Prisma/PostgreSQL, hash mật khẩu bằng Argon2 và phát JWT. Xem [phạm vi và giới hạn bảo mật](docs/SECURITY.md).

Repo có 22 Prisma models, migration SQL và nền tảng backend/frontend. Courts hiện cung cấp API đọc/fallback và catalog minh họa; dashboard dùng dữ liệu mẫu. Các workflow booking/payment/refund/check-in/email chưa được triển khai. Giao diện chi tiết sân và tài liệu pilot không thuộc mốc auth. Link chi tiết sân chỉ bật khi `NEXT_PUBLIC_COURT_DETAILS_ENABLED=true` và route tương ứng đã có trong bản phát hành; mặc định catalog hiển thị nút chưa khả dụng.

Lint, unit test, kiểm tra HTTP với dependency giả lập, kiểm tra frontend và build được dùng để kiểm chứng mốc auth. Chưa nghiệm thu auth với database ứng dụng hoặc browser kết nối API thật; chưa xác nhận migration trên DB đích. Refresh/rotation, thu hồi JWT khi logout, CSRF, email verification và khôi phục mật khẩu còn thiếu; đây chưa phải bản sẵn sàng production.

## Kiểm tra

```powershell
npm run lint
npm test
npm run test:auth:contract
npm run test:auth:ui
npm run test:auth:phones
npm run build
npm run build:web
```

Test HTTP dùng Prisma/JWT/guard giả lập; test migration PostgreSQL chỉ chạy khi có `AUTH_MIGRATION_TEST_URL` trỏ tới DB test được chỉ định. Build cần `DATABASE_URL` để đọc Prisma config và sinh client, nhưng không kết nối hoặc migrate DB.
