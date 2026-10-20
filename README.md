# Pickleball Booking

Next.js frontend và NestJS modular monolith. Backend dùng một PostgreSQL database do DATABASE_URL chọn, với PostgreSQL exclusion constraint bảo vệ lịch sân. Redis phục vụ session, thu hồi token (`tokenVersion`), CSRF và rate limiting; BullMQ dùng cùng Redis và chạy worker dọn hold booking hết hạn. Socket.IO hiện là scaffold realtime chưa nối vào luồng booking; frontend cập nhật availability và booking bằng HTTP polling. Root package.json/package-lock.json quản lý dependency chung.

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

Luồng hiện tại: catalog từ PostgreSQL → kiểm tra giá/lịch → giữ sân `HOLDING` 5 phút → xem/hủy booking của mình. Giá đến từ `PriceRule`; snapshot, history và occupancy được ghi atomically; PostgreSQL exclusion constraint bảo vệ cả buffer vệ sinh. GET availability chỉ đọc và coi hold quá hạn là không chặn lịch; worker BullMQ dọn hold hết hạn theo định kỳ, còn create/cancel tự đối soát trong transaction. Chưa có thanh toán hoặc booking `CONFIRMED`, guest, refund hay check-in. Dashboard được ghi nhãn DEMO.

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
npm run test:backend
npm run test:frontend
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

`npm test` chạy lần lượt `test:backend` và `test:frontend`, không cần DB, Redis hay backend server. Backend unit dùng `backend/jest.unit.config.js`, loại các suite `*.integration.spec.ts`; frontend dùng cấu hình độc lập `frontend/jest.config.js`, nhận `frontend/__tests__/**/*.spec.ts[x]`. Rendering specs dựng JSDOM, network tests mock fetch. `test:frontend:ui` chạy các rendering specs; `test:auth:ui` và `test:booking:ui` giữ alias theo feature. `test:auth:contract` chạy HTTP Nest và validation/network frontend qua hai cấu hình riêng.

Các lệnh cần storage tách riêng: `test:auth:storage`, `test:booking:integration`, `test:e2e`. `test:auth:phones` chạy Jest unit audit và migration/CLI opt-in trên DB loopback riêng `auth_validation_test` qua `AUTH_MIGRATION_TEST_URL`; đặt `AUTH_MIGRATION_REQUIRE_STORAGE=true` để buộc chạy phần DB (CI luôn bật). Suite này tạo lại bảng users, tuyệt đối không dùng DB ứng dụng.

Auth suites có các mức mock và storage thật; booking integration dùng HTTP/guards/PostgreSQL/Redis thật với URL test riêng. CI chạy migration vào DB test, booking integration, lint/unit/auth checks và build. Build cần `DATABASE_URL` để đọc Prisma config và sinh client, nhưng không kết nối hoặc migrate DB. CI không deploy.
