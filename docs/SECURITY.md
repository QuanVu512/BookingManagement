# Bảo mật, xác thực và quyền

Tài liệu này tách cơ chế đang có trong source khỏi các thành phần mới chỉ được biểu diễn trong schema hoặc thiết kế.

## Đã có trong source

- Login tìm user theo username/email/phone, so sánh mật khẩu bằng Argon2 và từ chối tài khoản không `ACTIVE`. Identifier được trim, email tra cứu ở dạng chữ thường; điện thoại tra cứu cả dạng `+84…` và dạng nội địa trong giai đoạn chuyển dữ liệu.
- Register hash mật khẩu bằng Argon2; username/email/phone/fullName được chuẩn hóa trước kiểm tra trùng và lưu. Điện thoại Việt Nam được kiểm tra bằng metadata `libphonenumber-js/max`, lưu dạng `+84…`; unique constraint tiếp tục bảo vệ đăng ký đồng thời.
- JWT access token hiện có thời hạn **7 ngày**. Backend trả token trong cookie `access_token` với `httpOnly`, `path=/`; production đặt `secure=true`, `sameSite=none`, môi trường khác đặt `sameSite=lax`.
- JWT strategy đọc token từ cookie hoặc Authorization Bearer header. Secret lấy từ `JWT_SECRET`; fallback mặc định chỉ dùng ngoài production. Production từ chối khởi tạo nếu thiếu secret, secret chỉ có khoảng trắng hoặc bằng fallback dev; môi trường triển khai cần cung cấp secret riêng đủ mạnh.
- Role enum: `CUSTOMER`, `STAFF`, `MANAGER`, `ADMIN`. `RolesGuard` hỗ trợ metadata `@Roles()` và kiểm tra role theo OR.
- `ThrottlerGuard` được đăng ký toàn cục với cấu hình hiện tại 60 request / 60 giây.
- CORS dùng `WEB_ORIGIN` (mặc định `http://localhost:3001`) và bật credentials.

## Giới hạn triển khai hiện tại

- `RefreshToken` có trong schema, nhưng service/controller hiện chưa có endpoint refresh hoặc token rotation.
- `RolesGuard` có trong AuthModule nhưng không được đăng ký global; không thấy route `@Roles()` trong các controller hiện tại. Không giả định mọi route đã được bảo vệ RBAC.
- Bootstrap dùng `ValidationPipe` toàn cục với `transform`, `whitelist` và `forbidNonWhitelisted`. DTO login/register kiểm tra trường bắt buộc, kiểu chuỗi, email và độ dài theo schema; field ngoài DTO bị từ chối. Response DTO định kiểu và mô tả Swagger, không validate dữ liệu đầu ra.
- Đăng ký yêu cầu username 8–100 ký tự, chỉ chữ Latin/số và ít nhất một chữ; email hợp lệ không giới hạn nhà cung cấp, họ tên cho phép Unicode. Mật khẩu đăng ký/đăng nhập từ 6 ký tự ASCII in được, không có khoảng trắng; giá trị mật khẩu không được trim hoặc đổi chữ hoa/thường. `confirmPassword` bắt buộc và phải khớp khi đăng ký, không lưu hoặc trả lại.
- Form đăng ký có xác nhận, hướng dẫn độ mạnh (Yếu/Vừa/Mạnh), cảnh báo Caps Lock/ký tự không hỗ trợ và nút hiện/ẩn mật khẩu. Backend quyết định validation cuối cùng; độ mạnh không đổi yêu cầu tối thiểu 6 ký tự.
- Không có xác nhận triển khai CSRF policy, rate limit riêng cho login, email verification hoặc khôi phục mật khẩu trong source hiện tại.
- Payment module còn rỗng; webhook signature/checksum payOS chưa có workflow được xác nhận. Dependency provider không chứng minh xác minh chữ ký đang chạy.

## Schema và thiết kế

Schema có bảng `refresh_tokens`, token truy cập booking cho guest và trường mã hóa thông tin đích hoàn tiền. Đây là thiết kế lưu trữ, không phải bằng chứng về lifecycle, key management hay mã hóa đang được thực thi. Không lưu secret/access token trong log hoặc tài liệu; khi implement cần hash token có thể revoke, quản lý encryption key ngoài DB và kiểm tra quyền theo từng booking.

Khi sửa quyền hoặc auth, kiểm tra cả cookie/Bearer extraction, trạng thái user, role tại controller, CORS credentials và khả năng replay/revoke. Đối chiếu [WORKFLOWS.md](WORKFLOWS.md) và contract schema trong [DATABASE.md](DATABASE.md); không biến tính năng chưa có thành cam kết bảo mật.
