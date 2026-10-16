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

Cần Node theo.nvmrc, npm và PostgreSQL/Redis tương ứng cấu hình. Nếu chưa có.env, tạo từ.env.example; cấu hình DATABASE_URL/Redis, JWT_SECRET ngẫu nhiên 64 hex, WEB_ORIGIN và SMTP cho xác minh tài khoản theo SECURITY.md. Đặt NEXT_PUBLIC_COURT_DETAILS_ENABLED=true nếu file local cũ đang tắt. Với DB/schema development mới hoặc trống:

```powershell
npm ci
npm run prisma:migrate:deploy
npm run prisma:generate
npm run start:dev
```

PostgreSQL/Redis local: npm run infra:up trước migration/start. Nếu DB là Neon, khởi động Redis local theo OPERATIONS; không cần PostgreSQL local. Terminal thứ hai chạy npm run web:dev.

Build API sinh client rồi compile; không tự migrate DB. DB có bảng/dữ liệu sẵn cần baseline phù hợp trước apply v1.

## Booking MVP

Luồng hiện tại: catalog từ PostgreSQL → kiểm tra giá/lịch → giữ sân `HOLDING` 5 phút → xem/hủy booking của mình. Giá đến từ `PriceRule`; snapshot, history và occupancy được ghi atomically; PostgreSQL exclusion constraint bảo vệ cả buffer vệ sinh. Chưa có thanh toán hoặc booking `CONFIRMED`, guest, refund hay check-in. Dashboard được ghi nhãn DEMO.

Sau migration/generate, chạy seed vào **DB development/test đã chọn**:

```powershell
# DATABASE_URL phải được cấu hình tường minh; seed không tự đọc .env.
npm run seed:courts
```

Seed có thể chạy lại, không nhân bản hoặc ghi đè dữ liệu. Mở `/`, đăng nhập tài khoản đã xác minh email, chọn sân, kiểm tra lịch/giá và giữ chỗ. API lỗi sẽ hiện lỗi hoặc danh sách rỗng, không fallback sân mẫu. Xem [API, chính sách MVP, seed và PostgreSQL integration](docs/BOOKING-MVP.md).

## Phạm vi hiện tại

Mốc đầu tiên là auth cơ bản: đăng ký, đăng nhập bằng username/email/điện thoại, đọc phiên và đăng xuất; frontend có form validation, modal và cookie HTTP-only do API quản lý. Backend lưu tài khoản bằng Prisma/PostgreSQL, hash mật khẩu bằng Argon2 và phát JWT. Xem [phạm vi và giới hạn bảo mật](docs/SECURITY.md).

Repo có 22 Prisma models, migration SQL, booking MVP và nền tảng backend/frontend. Courts chỉ trả sân/chi nhánh hoạt động với giá từ DB. Chi tiết sân và Booking của tôi đã nối API; link chi tiết bật mặc định (tắt bằng `NEXT_PUBLIC_COURT_DETAILS_ENABLED=false`).

Auth có thu hồi JWT, CSRF, xác minh email và recovery; xem contract và giới hạn tại [SECURITY](docs/SECURITY.md). Không có refresh rotation. Test trên storage riêng không chứng minh DB ứng dụng, SMTP provider hoặc production đã được nghiệm thu.

## Kiểm tra

```powershell
npm run lint
npm test
npm run test:auth:contract
npm run test:frontend:ui
npm run test:auth:ui
npm run test:auth:phones
npm run test:booking:ui
# Sau khi cấu hình DB/Redis test riêng theo docs/BOOKING-MVP.md:
npm run test:booking:integration
npm run build
npm run build:web
```

`npm run test:frontend:ui` chạy toàn bộ test rendering React/Next.js qua `backend/jest.frontend.config.js`. Đặt test tại `backend/test/` với tên `frontend-<feature>-rendering.spec.tsx` để được tự động nhận diện. `test:auth:ui` và `test:booking:ui` dùng cùng config nhưng chỉ chạy suite tương ứng để debug hoặc dùng trong từng bước CI. Config hiện chỉ tìm test trong `backend/test/`; nếu đặt test tại `frontend/`, cần cập nhật `roots` hoặc di chuyển config.

Auth suites có các mức mock và storage thật; booking integration dùng HTTP/guards/PostgreSQL/Redis thật với URL test riêng. CI chạy migration vào DB test, booking integration, lint/unit/auth checks và build. Build cần `DATABASE_URL` để đọc Prisma config và sinh client, nhưng không kết nối hoặc migrate DB. CI không deploy.
