# Khởi động môi trường local

Hướng dẫn dành cho developer chạy frontend/API trên host, với PostgreSQL, Redis và Mailpit trong Docker. Chạy từ root repository, dùng DB development mới; DB có dữ liệu cần baseline riêng.

## 1. Chuẩn bị

- Node.js đúng bản trong [.nvmrc](../.nvmrc), tương thích [package.json](../package.json).
- npm, Docker Compose v2 và Docker engine đang chạy.
- Cổng `4000`, `4001`, `5433`, `6380`, `1025`, `8025` sẵn sàng.
- Mạng để cài dependency; đăng ký/reset cần backend truy cập HIBP.

```powershell
node --version
npm --version
docker compose version
npm ci
```

## 2. Tạo cấu hình

Tạo `backend/.env`, `frontend/.env.local`, `infra/.env` theo mẫu tại [CONFIGURATION.md](CONFIGURATION.md). Nếu checkout có `.env.example` theo thành phần, có thể sao chép trước rồi đối chiếu biến bắt buộc. Không ghi đè cấu hình local đã có.

Tạo JWT secret riêng và đặt vào `JWT_SECRET` của backend:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Đồng bộ `DATABASE_URL` với credential/cổng/database trong `infra/.env`; đồng bộ Redis URL với host/port. Không đưa secret vào `NEXT_PUBLIC_*`. Nếu dùng env root cũ, đọc [chuyển cấu hình](OPERATIONS.md#phân-vùng-env).

## 3. Khởi động hạ tầng

Dùng Compose tường minh để chọn file hạ tầng, kể cả checkout còn npm script dùng env root:

```powershell
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --wait postgres redis mailpit
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
```

Mong đợi: ba service chạy và healthcheck đạt. Cổng bind loopback theo [Compose](../infra/docker-compose.yml). Nếu dùng DB ngoài Docker, chỉ chạy Redis/Mailpit và giữ URL được giao; không tự migrate DB dùng chung.

## 4. Chuẩn bị database development

Kiểm tra URL đích. Chỉ apply vào DB mới/trống dành riêng cho dự án:

```powershell
npm run prisma:migrate:deploy
npm run prisma:generate
npm run prisma:migrate:status
```

`migrate deploy` thay đổi schema; `generate` chỉ sinh client. DB có bảng/dữ liệu cần baseline theo [OPERATIONS.md](OPERATIONS.md). Không dùng reset để sửa setup.

## 5. Tạo danh mục sân nếu cần

Catalog rỗng hợp lệ khi DB chưa có sân. Chỉ seed development/test: đặt `SEED_ENABLED=true`, `SEED_ALLOWED_HOST` và `SEED_ALLOWED_DATABASE` khớp URL trong `backend/.env`, rồi nạp env tường minh:

```powershell
npx --no-install dotenv run -f backend/.env -- npm run seed:courts
```

Seed không tự đọc env; guard từ chối production hoặc ngoài allowlist. Không cần admin để duyệt sân hoặc đăng ký. Xem [Booking MVP](BOOKING-MVP.md).

## 6. Chạy API và frontend

Terminal thứ nhất:

```powershell
npm run start:dev
```

Terminal thứ hai:

```powershell
npm run web:dev
```

Mở <http://localhost:4001> và Swagger <http://localhost:4000/api/docs>. Cần `PORT=4000`; bootstrap mặc định `3000` khi thiếu biến. Swagger chỉ mount ngoài production.

## 7. Xác nhận kết quả

```powershell
Invoke-WebRequest http://localhost:4001/ -UseBasicParsing | Select-Object StatusCode
Invoke-RestMethod http://localhost:4000/api/courts
```

Website phải tải được; API phải trả catalog hợp lệ, có thể rỗng. Website trả 200 riêng lẻ chưa chứng minh API/DB hoạt động. Đăng ký bằng browser, xem OTP tại Mailpit <http://127.0.0.1:8025>, xác minh rồi đăng nhập. Không cần giao dịch thật để kiểm tra setup.

Xem [API](API.md) và [pipeline](PIPELINES.md). Các command ở đây là hướng dẫn; cần chạy trên môi trường mới riêng để chứng minh toàn bộ quy trình cài đặt.

## Khắc phục nhanh

| Triệu chứng                | Kiểm tra                                                     |
| -------------------------- | ------------------------------------------------------------ |
| API connection refused     | Startup log, `PORT`, process API; frontend không tự chạy API |
| DB authentication failed   | URL/credential/cổng; env mới không đổi credential volume cũ  |
| Redis/BullMQ lỗi           | URL và host/port/password phải cùng môi trường               |
| Không thấy OTP local       | Mailpit healthy, SMTP `1025`, user/password rỗng, quota gửi  |
| Mutation trả 403           | Origin khớp `WEB_ORIGIN`, cookie credentials và CSRF         |
| Build frontend từ chối URL | Production build cần API origin HTTPS hợp lệ                 |

## Dừng môi trường

Dừng process development bằng Ctrl+C trong terminal tương ứng; dừng hạ tầng và giữ volume:

```powershell
docker compose --env-file infra/.env -f infra/docker-compose.yml down
```

Không thêm `-v` khi cần giữ dữ liệu. Xem [OPERATIONS.md](OPERATIONS.md).
