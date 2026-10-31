# Tham chiếu cấu hình

Mẫu dưới đây chỉ dùng development local, không phải credential production. Chạy từ root; không commit file env local.

## Phân vùng

| File local            | Consumer                         | Nội dung                                             |
| --------------------- | -------------------------------- | ---------------------------------------------------- |
| `backend/.env`        | Nest ConfigModule, Prisma config | API, DB, Redis, JWT, SMTP, provider                  |
| `frontend/.env.local` | Next.js                          | Public origins và feature flags                      |
| `infra/.env`          | Compose qua `--env-file`         | Credential/cổng development                          |
| `backend/.env.test`   | E2E và Compose test              | Storage test riêng; xem [PIPELINES.md](PIPELINES.md) |

Checkout cũ còn mẫu root và script `infra:*` đọc `.env` root. Dùng Compose tường minh trong [Getting started](GETTING-STARTED.md); kiểm tra [package.json](../package.json) của revision đang dùng trước khi chạy alias.

## Backend development

Tạo `backend/.env`, thay JWT placeholder bằng secret ngẫu nhiên 64 ký tự hex:

```dotenv
NODE_ENV=development
PORT=4000
WEB_ORIGIN=http://localhost:4001
DATABASE_URL=postgresql://pickleball:local_dev_password@localhost:5433/pickleball?schema=public
REDIS_URL=redis://localhost:6380
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=
JWT_SECRET=replace-with-your-own-random-64-hex-character-secret
TRUSTED_PROXY=
BOOKING_EXPIRY_INTERVAL_MS=15000
BOOKING_EXPIRY_BATCH_SIZE=100
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_REQUIRE_TLS=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=no-reply@smasharena.test
EMAIL_OTP_ENABLED=true
AUTH_MAIL_MAX_PER_HOUR=60
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
SEED_ENABLED=false
SEED_ALLOWED_HOST=localhost
SEED_ALLOWED_DATABASE=pickleball
```

Tạo secret theo [Getting started](GETTING-STARTED.md#2-tạo-cấu-hình); không chạy bằng placeholder. SMTP không TLS chỉ dùng Mailpit local. Để payOS keys rỗng khi chưa cấu hình; `replace-me` không phải credential hợp lệ.

| Biến                                         | Ý nghĩa/điều kiện                                               |
| -------------------------------------------- | --------------------------------------------------------------- |
| `PORT`                                       | API; bootstrap mặc định `3000`, hướng dẫn chọn `4000`           |
| `WEB_ORIGIN`                                 | Origin chính xác cho CORS, CSRF, recovery; production cần HTTPS |
| `DATABASE_URL`                               | DB/schema Prisma; không suy target từ tên container             |
| `REDIS_URL`                                  | Redis client ứng dụng                                           |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | BullMQ; đồng bộ với Redis URL                                   |
| `JWT_SECRET`                                 | Secret backend, không đưa vào frontend/log/issue                |
| `TRUSTED_PROXY`                              | Rỗng nếu trực tiếp; chỉ allowlist proxy thực tế                 |
| `BOOKING_EXPIRY_INTERVAL_MS`                 | Expiry sweep: 5.000–300.000 ms                                  |
| `BOOKING_EXPIRY_BATCH_SIZE`                  | Batch: 1–1.000                                                  |
| `AUTH_MAIL_MAX_PER_HOUR`                     | Quota thư phù hợp provider                                      |
| `PAYOS_*`                                    | Credential theo môi trường; có cấu hình chưa chứng minh kết nối |
| `SEED_*`                                     | Guard development/test; seed không tự nạp env                   |

Biến tùy chọn `AUTH_OTP_HMAC_SECRET`, `REFUND_DESTINATION_KEY`, `GUEST_MANAGE_TOKEN_TTL_DAYS` cần đối chiếu consumer và [SECURITY.md](SECURITY.md). Không tự bật tích hợp tài chính hoặc đổi policy bằng biến chưa kiểm chứng.

## Frontend development

Tạo `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SITE_ORIGIN=http://localhost:4001
NEXT_PUBLIC_COURT_DETAILS_ENABLED=true
NEXT_PUBLIC_AI_ASSISTANT_ENABLED=true
```

`NEXT_PUBLIC_*` đi vào bundle trình duyệt; không đặt JWT secret, URL DB, SMTP password hay provider key. Feature flag không thay quyền backend. Production build cần API origin HTTPS hợp lệ.

## Hạ tầng local

Tạo `infra/.env`, đồng bộ với `DATABASE_URL`:

```dotenv
POSTGRES_USER=pickleball
POSTGRES_PASSWORD=local_dev_password
POSTGRES_DB=pickleball
POSTGRES_PORT=5433
```

Redis host port `6380`; Mailpit SMTP/UI `1025`/`8025` nằm trong [Compose](../infra/docker-compose.yml). Đổi `POSTGRES_*` không đổi credential volume đã khởi tạo. Không xóa volume để sửa credential khi chưa được phép mất dữ liệu.

## Cách nạp và ưu tiên

Nest hỗ trợ env root cũ. `start:dev` đổi cwd sang `backend/`; `start:prod` từ root có thể có thứ tự khác. Prisma tự nạp `backend/.env` khi process chưa có `DATABASE_URL`, ngoại trừ seed. Next nạp env trong `frontend/`, config vẫn có fallback root. Biến process thường ưu tiên file; `dotenv run --override` là ngoại lệ.

Sau chuyển cấu hình, kiểm tra env root để tránh giá trị cũ. Restart API/frontend sau đổi env; public variables cần build lại ở production. Không in env thật để chẩn đoán.
