# Phạm vi giao diện hiện tại

Ba màn hình Trang chủ, Đặt sân và Lịch của tôi được chuyển sang thiết kế HTML do người dùng cung cấp: dark glass, neon emerald, Plus Jakarta Sans, nền kinetic wave và các animation. Login đã có giữ nguyên; không nhúng script nghiệp vụ giả hoặc nhập backend/schema/migration từ mẫu.

| Route hoặc khu vực                                                  | Giao diện                                                                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/`                                                                 | Hero shimmer, bốn ô thông tin lấy từ dữ liệu thật, header/footer ba mục, catalog hai cột và bộ lọc loại sân |
| `/booking`, `/courts/[courtId]`                                     | Chọn sân, dải bảy ngày, ma trận giờ, gallery mở rộng, dịch vụ và tóm tắt thanh toán sticky; mobile một cột  |
| `/bookings`, `?tab=payments`                                        | Thẻ lịch đặt dạng vé, bộ lọc các trạng thái đã tải; giữ session gate/reload/hủy/phân trang và hóa đơn thật  |
| `/account`, `/account/security`, `/account/payments`, `/dashboard`  | Component tương ứng đã khớp nguồn; dùng header/theme chung và điều hướng login bằng trang riêng             |
| `/auth/register`, `/auth/verify-email`, `/auth/resend-verification` | Giữ form/trang và workflow OTP mới; shell dùng màu nền/card/viền theo theme chung                           |
| `/auth/forgot-password`, `/auth/reset-password`                     | Form đã khớp bố cục nguồn; giữ lỗi validation và đường về login hiện hành                                   |
| `/auth/login`                                                       | Giữ card kính/neon/canvas riêng của login; không đưa popup đăng nhập giả của mẫu vào app                    |
| Guest dialog                                                        | Bố cục gọn từ nguồn, focus trap/Escape, tiếp tục xem sân và giữ đích điều hướng hiện hành                   |

Hướng dẫn chạy UI tại [Getting started](GETTING-STARTED.md); contract API tại [API](API.md). Mô tả layout/source không thay screenshot hoặc kiểm chứng browser của revision đang dùng.

## Animation

Canvas theo công thức của mẫu, tâm sóng nằm giữa chiều cao viewport theo chỉ đạo mới nhất. Tương tác chuột tính lại theo vị trí canvas. Shimmer chữ, pulse/ping, hover ảnh/nút và chuyển cảnh được giữ; mặc định bật, không tự bỏ vì reduced-motion hoặc vì hero ra khỏi viewport. Có nút người dùng chủ động tạm dừng; canvas dừng khi tab ẩn và cleanup khi unmount. CSS mới giới hạn trong ArenaShell, không thay quy tắc reduced-motion của login hoặc component ngoài scope.

## Dữ liệu và tương thích

- Không dùng coupon SMASH2026, tài khoản mẫu, vé mẫu, mã PIN hoặc QR minh họa; không hứa chính sách hoàn tiền 4 giờ/24 giờ từ HTML. Coupon disabled có chú thích; phần vé giữ mã booking thật và ghi rõ chưa có QR/PIN check-in. Hộp chỉ đường dùng địa chỉ công bố và liên kết Maps hiện có.
- Catalog sân, lịch, tổng tiền và kết quả thanh toán lấy từ API; không dùng dữ liệu sản phẩm hoặc QR giả để thay cho API chưa sẵn sàng.
- Không chọn dịch vụ vẫn dùng `GET /api/courts/:id/availability` và body giữ chỗ cũ. Các trường snapshot dịch vụ là tùy chọn để tương thích response đang có.
- Danh mục nước uống/dụng cụ cần `GET /api/courts/:id/services`; báo giá kèm dịch vụ cần `POST /api/courts/:id/quote`. Backend hiện tại chưa có hai route này: vùng dịch vụ hiển thị lỗi tải/thử lại, không chặn đặt sân không chọn dịch vụ. Đây là dependency backend, không được xử lý bằng cách tự seed/migrate hoặc dùng giá/tồn kho giả.
- QR checkout dùng payment API đã có. Payload QR và thời gian server là tùy chọn; thiếu payload không tự tạo QR từ dữ liệu tự suy đoán. Chỉ hiển thị thành công khi server xác nhận trạng thái phù hợp.
- Các rule client và hình thức trình bày từ nguồn không thay cơ chế xác nhận giá, quyền, idempotency hoặc trạng thái ở server.
- Ảnh sản phẩm là tài nguyên local tại `frontend/public/products/`, nguồn ghi trong `sources.json`. Gallery sân được gắn nhãn minh họa.

Chi tiết kiến trúc tại [FRONTEND-ARCHITECTURE.md](FRONTEND-ARCHITECTURE.md), Auth tại [SECURITY.md](SECURITY.md), SMTP local tại [OPERATIONS.md](OPERATIONS.md#smtp-local-bằng-mailpit).
