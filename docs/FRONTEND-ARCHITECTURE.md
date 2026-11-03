# Kiến trúc Frontend

Frontend được xây dựng bằng **Next.js 16 (App Router)**, **React 19** và **TypeScript 5** đặt tại thư mục `frontend/`. Ứng dụng sử dụng hệ thống CSS thuần kết hợp CSS Custom Properties và CSS Modules (`frontend/app/globals.css`, `arena*.css`, `booking-live.css`) mà không phụ thuộc vào Tailwind CSS trong `package.json`.

## Cấu trúc thư mục và phân vùng chức năng

| Đường dẫn                                          | Vai trò thực tế trong mã nguồn                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/app/`                                    | Định tuyến App Router: trang chủ (`/`), đặt sân trực tiếp (`/booking`), chi tiết sân (`/courts/[courtId]`), lịch đặt của tôi (`/bookings`), tra cứu đơn khách vãng lai (`/booking/lookup`), xác thực (`/auth/login`, `/auth/register`, `/auth/verify-email`, `/auth/resend-verification`), hồ sơ cá nhân (`/account`), vận hành (`/dashboard`), pháp lý (`/legal/*`), quyền riêng tư (`/privacy`) và hỗ trợ (`/support`).                                                                              |
| `frontend/features/courts/`                        | Hiển thị danh sách sân, bộ lọc loại sân, thẻ thông tin sân (`CourtInfoCard`), thư viện ảnh và tích hợp `GET /api/courts`.                                                                                                                                                                                                                                                                                                                                                                              |
| `frontend/features/booking/`                       | Luồng đặt sân trực tiếp (`LiveBookingPanel`), lưới kiểm tra lịch chiếm sân (`useCourtOccupancyGrid`), báo giá tự động (`useBookingQuote`), giữ chỗ (`useBookingHold`), danh sách vé đã đặt (`MyBookingsPanel`), hủy giữ chỗ và tra cứu đơn khách vãng lai (`GuestLookupForm`).                                                                                                                                                                                                                         |
| `frontend/features/payment/`                       | Luồng thanh toán hợp nhất (`UnifiedCheckoutDialog`), biểu mẫu thông tin liên hệ và xác thực OTP 6 số cho khách vãng lai (`GuestBookingModal`, `GuestOtpDialog`), hộp thoại quét mã VietQR (`BookingQrModal`), quản lý định danh phiên thanh toán (`guest-checkout-identity.ts`), lưu trữ token quản lý đơn (`guest-manage-token.ts`), khôi phục qua liên kết email (`use-recovery-link.ts`), cảnh báo đơn đang chờ (`PendingBookingAlert`) và khu vực giả lập thanh toán Demo (`DemoSimulateSection`). |
| `frontend/features/account/`                       | Quản lý thông tin hồ sơ cá nhân, đổi mật khẩu và yêu cầu xóa/ẩn dữ liệu tài khoản.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `frontend/features/ai-assistant/`                  | Nút nổi (FAB) và hộp thoại hỏi đáp chính sách đặt sân tích hợp `POST /api/ai/chat`.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `frontend/features/cookie-consent/`                | Khung thông báo tùy chọn cookie và `CookiePreferencesProvider`.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `frontend/features/legal/`, `privacy/`, `support/` | Khung hiển thị văn bản pháp lý có phiên bản, biểu mẫu yêu cầu quyền dữ liệu cá nhân (DSR) và biểu mẫu gửi yêu cầu hỗ trợ.                                                                                                                                                                                                                                                                                                                                                                              |
| `frontend/components/home/`, `components/auth/`    | `ArenaShell`, thanh điều hướng `SportyHeader`, hiệu ứng nền sóng `ArenaBackground`, biểu mẫu đăng nhập/đăng ký/nhập OTP.                                                                                                                                                                                                                                                                                                                                                                               |
| `frontend/context/auth-context.tsx`                | Quản lý trạng thái phiên đăng nhập (`useAuthSession`), điều hướng xác thực (`useAuthDialog`) và các hành động đăng nhập/đăng xuất (`useAuthActions`).                                                                                                                                                                                                                                                                                                                                                  |
| `frontend/services/` & `frontend/lib/`             | Tầng gọi HTTP (`credentials: 'include'`, tự động đính kèm `X-CSRF-Token`), kiểm tra hợp lệ biểu mẫu (`auth-validation.ts`) và chuẩn hóa số điện thoại/email phía trình duyệt.                                                                                                                                                                                                                                                                                                                          |

Mỗi miền chức năng lớn trong `frontend/features/<feature>/` được tách thành `components/`, `hooks/`, `api/` và `model/`:

- **Container / Panel**: Kết nối ngữ cảnh phiên đăng nhập (`AuthContext`), các hook nghiệp vụ và các thành phần hiển thị.
- **Hooks**: Sở hữu máy trạng thái (state machine) của từng luồng tương tác (như đếm ngược giữ chỗ, thăm dò trạng thái thanh toán, tự động báo giá).
- **API Services**: Chỉ chịu trách nhiệm giao tiếp HTTP, giải mã phản hồi và chuẩn hóa lỗi từ máy chủ.

## Quản lý trạng thái và các luồng nghiệp vụ trọng tâm

### 1. Phiên đăng nhập và Bảo mật Cookie/CSRF (`AuthContext`)

- `AuthProvider` bọc ở `frontend/app/layout.tsx`, tách ngữ cảnh thành 3 hook chuyên biệt (`useAuthSession`, `useAuthDialog`, `useAuthActions`) để tránh render lại thanh điều hướng khi trạng thái cục bộ thay đổi.
- Trình duyệt gửi `credentials: 'include'` cho các yêu cầu xác thực; token truy cập nằm trong cookie `HttpOnly` do backend quản lý, mã JavaScript phía trình duyệt không đọc trực tiếp JWT. Các yêu cầu thay đổi dữ liệu đính kèm header `X-CSRF-Token`.
- Khi đăng ký hoặc đăng nhập tài khoản chưa xác minh email, trình duyệt lưu tạm bằng chứng gửi mã vào `sessionStorage` của tab hiện tại và chuyển sang `/auth/verify-email` với ô nhập OTP 6 chữ số (hỗ trợ dán chuỗi 6 số, phím mũi tên, Backspace và khóa gửi trùng).

### 2. Đặt sân trực tiếp, Kiểm tra lịch bận và Báo giá tự động (`LiveBookingPanel`)

- **Kiểm tra lịch chiếm sân (`useCourtOccupancyGrid`)**: Gọi `GET /api/courts/:id/occupancies` để hiển thị các khung giờ đã có người đặt hoặc đang khóa. Nếu các lần làm mới lịch liên tiếp thất bại vượt ngưỡng an toàn (`OCCUPANCY_STALE_FAILURE_THRESHOLD`), giao diện tự động khóa nút đặt sân và yêu cầu làm mới lại dữ liệu để tránh đặt nhầm vào khung giờ đã bận.
- **Báo giá tự động (`useBookingQuote`)**: Khi người dùng chọn sân, ngày và khung giờ hợp lệ (nằm trong giờ mở cửa từ 06:00 đến 23:00 và chưa qua giờ hiện tại), giao diện tự động gọi `POST /api/bookings/quote` (có debounce 120ms) để lấy tổng tiền sân và số tiền cọc 30% chính xác từ máy chủ mà không cần bấm nút tính giá thủ công.

### 3. Luồng thanh toán hợp nhất và Đặt sân khách vãng lai (`UnifiedCheckoutDialog` & `BookingQrModal`)

- **Đặt cọc 30% thống nhất**: Cả thành viên đã đăng nhập (Member) và khách vãng lai (Guest) đều thanh toán khoản cọc **30%** trong thời gian giữ chỗ **5 phút** (`HOLDING`).
- **Hộp thoại thanh toán hợp nhất (`UnifiedCheckoutDialog`)**:
  - Tuân thủ tiêu chuẩn trợ năng WCAG 2.2 AA (`role="dialog"`, `aria-modal="true"`, bẫy tiêu điểm bàn phím, đóng bằng phím `Escape` mà không tự ý hủy đơn giữ chỗ đang còn hạn).
  - **Bước 1 (Dành cho Guest – `GuestBookingModal` & `GuestOtpDialog`)**: Thu thập họ tên, email, số điện thoại và xác thực OTP 6 chữ số qua `POST /api/guest/bookings/otp/send` và `POST /api/guest/bookings/otp/verify`. Trình duyệt sinh cặp định danh phiên `checkoutIntentId` và `recoverySecret` lưu trong `sessionStorage` (`guest-checkout-identity.ts`), sau đó gọi `POST /api/guest/bookings` để giữ chỗ và tạo yêu cầu thanh toán bền vững.
  - **Bước 2 (Hiển thị mã VietQR & Thăm dò kết quả – `BookingQrModal`)**:
    - Không bao giờ tự vẽ mã QR giả phía trình duyệt; chỉ hiển thị mã QR khi máy chủ trả về `vietQrPayload` hoặc `checkoutUrl` hợp lệ.
    - Xử lý đầy đủ các trạng thái của `PaymentRequest`:
      - `CREATING`: Hiển thị vòng xoay đang khởi tạo mã QR với cổng thanh toán và tự động thăm dò trạng thái.
      - `PENDING`: Hiển thị mã VietQR, số tiền cọc 30%, đồng hồ đếm ngược 5 phút và thăm dò trạng thái định kỳ.
      - `FAILED` hoặc `resumeCanCreate = true`: Hiển thị nút **"Tạo lại mã thanh toán"** để gọi lại API khởi tạo link thu trên đơn giữ chỗ còn hạn.
      - Khi đồng hồ đếm ngược về `0`: Chỉ gọi hàm `refreshRead` (gửi yêu cầu `GET` để đọc lại kết quả thanh toán cuối cùng từ máy chủ), **tuyệt đối không** tự động gửi `POST` tạo lại yêu cầu thanh toán mới.
      - Khi người dùng chủ động hủy đơn giữ chỗ: Gọi `markCancelled` để khóa trạng thái đã hủy và dừng ngay vòng lặp thăm dò.

### 4. Khôi phục phiên thanh toán và Tra cứu đơn khách vãng lai

- **Cảnh báo đơn đang chờ (`PendingBookingAlert`)**: Khi người dùng đóng hộp thoại QR mà đơn `HOLDING` vẫn còn hạn, thanh thông báo nổi cho phép mở lại ngay phiên thanh toán đang dở dang từ `sessionStorage`.
- **Khôi phục cùng trình duyệt**: Nếu `guest-manage-token` bị thiếu nhưng tab vẫn còn `checkoutIntentId` và `recoverySecret`, frontend gọi `POST /api/guest/bookings/:bookingId/checkout/resume` kèm header `X-Booking-Checkout-Token` để khôi phục quyền truy cập đơn.
- **Khôi phục qua liên kết email (`useRecoveryLink`)**: Khi khách mở liên kết khôi phục từ email có dạng `/booking?recover=<bookingId>#recovery=<rawToken>`, hook tự động đọc mã từ URL fragment (`#recovery=...`), xóa sạch tham số và hash khỏi thanh địa chỉ trình duyệt bằng `window.history.replaceState` để chống rò rỉ token qua lịch sử duyệt web/Referer, sau đó gọi `POST /api/guest/bookings/:bookingId/recovery` để đổi lấy `manageToken` mới.
- **Tra cứu đơn theo thông tin liên hệ (`/booking/lookup`)**: Trang `GuestLookupForm` gọi `POST /api/guest/bookings/lookup` để yêu cầu hệ thống gửi lại danh sách đơn và liên kết quản lý vào email đã đặt sân; giao diện luôn hiển thị thông báo trung lập để bảo mật danh tính khách hàng.

## Giao diện, Font chữ và Bảo mật Trình duyệt

- **Thiết kế hiển thị (`ArenaShell`)**: Sử dụng tông màu tối thể thao (`#060911`), thẻ kính mờ (`#0b1220`), điểm nhấn xanh neon (`#10e760`) và font chữ `Plus Jakarta Sans` / `Inter` được tự lưu trữ (self-hosted) lúc build thông qua `next/font/google` (trình duyệt không gửi yêu cầu tải font trực tiếp sang máy chủ Google).
- **Hiệu ứng Canvas**: Nền sóng động tự động tạm dừng vòng lặp `requestAnimationFrame` khi tab trình duyệt bị ẩn hoặc khi người dùng bấm nút tạm dừng hiệu ứng / bật chế độ giảm chuyển động (`prefers-reduced-motion`).
- **Tiêu đề bảo mật (`next.config.mjs`)**: Bật `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` và `Content-Security-Policy`. Chỉ các biến môi trường có tiền tố `NEXT_PUBLIC_*` mới được phép đưa vào bundle phía trình duyệt.

## Tài liệu tham chiếu

- [Tổng quan kiến trúc (ARCHITECTURE.md)](ARCHITECTURE.md)
- [Kiến trúc Backend (BACKEND-ARCHITECTURE.md)](BACKEND-ARCHITECTURE.md)
- [Danh mục API (API.md)](API.md)
- [Hợp đồng khôi phục đơn khách vãng lai (GUEST-BOOKING-RECOVERY-CONTRACTS.md)](GUEST-BOOKING-RECOVERY-CONTRACTS.md)
