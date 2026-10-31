# Kiến trúc frontend

Frontend dùng Next.js App Router trong `frontend/`, React và TypeScript. Phiên bản khai báo và chính sách dependency nằm ở [TECH-STACK.md](TECH-STACK.md).

## Các vùng chính

| Đường dẫn                                                            | Vai trò hiện tại                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `frontend/app/`                                                      | Routes catalog/booking/bookings/account/auth/dashboard/legal/support và layout |
| `frontend/components/auth/`                                          | Trang login/register/OTP và dialog xác nhận guest                              |
| `frontend/features/courts/`, `frontend/features/booking/`            | Luồng chọn sân, availability, giữ chỗ và booking của tôi                       |
| `frontend/features/payment/`                                         | Form khách vãng lai, dialog nhập OTP email, modal QR khóa giao diện            |
| `frontend/features/ai-assistant/`                                    | Nút nổi FAB tròn (icon message/robot), popup chat hỏi đáp AI                   |
| `frontend/features/cookie-consent/`                                  | Banner chấp thuận cookie và CookiePreferencesProvider                          |
| `frontend/features/legal/`                                           | Shell trang pháp lý, collection notice và footer pháp lý                       |
| `frontend/components/home/`                                          | Header, catalog sân và các khối trang chủ                                      |
| `frontend/context/auth-context.tsx`                                  | Session state, điều hướng đăng nhập, guest state và auth API                   |
| `frontend/services/auth.ts`, `frontend/services/courts.ts`           | Gọi HTTP, kiểm tra response và timeout/fallback cho các request đọc            |
| `frontend/hooks/use-auth-form.ts`, `frontend/lib/auth-validation.ts` | State form, validation/chuẩn hóa và khóa submit trùng                          |
| `frontend/types/`                                                    | Kiểu dữ liệu frontend                                                          |

Feature có nhiều luồng độc lập ưu tiên cách tổ chức của Booking trong `frontend/features/<feature>/`: `components/`, `hooks/`, `api/`, `model/`. Panel/container ghép session, hook và view; view nhận props/callback; hook sở hữu state/interaction có cohesion; API service chỉ sở hữu HTTP và response contract. Không gom toàn bộ feature vào một service hoặc chuyển nguyên khối đó thành một hook tổng. Chỉ tách thêm component khi có trách nhiệm/dependency rõ, không tạo folder rỗng hoặc store toàn cục để đủ mẫu.

`AuthProvider` được đặt ở root layout. Những component dùng hook/state, event handler hoặc `AuthContext` phải là client component (`'use client'`); giữ component server khi không cần tương tác phía browser.

Auth state tách thành `useAuthSession`, `useAuthDialog` và `useAuthActions`. Header/dashboard chỉ đăng ký session và action ổn định; thay đổi trạng thái guest không khiến Header render lại. `openSignIn` điều hướng sang `/auth/login`, không mở popup. `useAuth` vẫn cung cấp API kết hợp cho consumer cần cả ba nhóm.

Client kiểm tra sơ bộ email (dot-atom/quoted local part, domain DNS) và số Việt Nam (`03/05/07/08/09`, `02`, dạng `0…` hoặc `+84…`) bằng regex; không import `class-validator` hoặc metadata số điện thoại toàn cầu vào bundle. Đây không phải bộ phân tích toàn bộ RFC 5322 hay danh sách đầu số được cấp phát. Backend vẫn xác thực hợp lệ cuối cùng bằng DTO và regex đồng bộ với migration SQL. Form tự focus ô đầu, khóa input bằng fieldset khi gửi, hiển thị spinner và dùng khóa đồng bộ để ngăn submit trùng trước khi React cập nhật state.

Ô nhập OTP gồm 6 input một chữ số, dùng chung state mảng ở hook xác minh và ghép thành chuỗi khi gửi API. Control giữ số 0 đầu, tự chuyển focus khi nhập, hỗ trợ Backspace/phím mũi tên và dán mã: đủ 6 số điền toàn bộ, một phần điền từ ô đang chọn. Gửi lại thành công xóa cả 6 ô; không tự submit khi vừa nhập đủ mã.

## State và API

Chưa có thư viện state/API client riêng trong dependency. AuthContext ủy quyền HTTP cho service Auth; service gọi các route Nest:

- `GET /api/auth/me`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`

URL lấy từ `NEXT_PUBLIC_API_URL`; dev/test mặc định `http://localhost:4000`, production bắt buộc origin HTTPS hợp lệ và fail build nếu thiếu/sai. Auth request đặt `credentials: 'include'` để browser gửi/nhận cookie. Cookie do backend quản lý; frontend không đọc access token. Payload đăng ký có `confirmPassword`, chỉ dùng kiểm tra khớp tại backend. Form hiển thị message generic từ server cho đăng ký mới/trùng email/phone; username trùng vẫn là lỗi. Không suy ra account được tạo chỉ từ 201.

Next config đặt nosniff, frame deny, referrer policy `strict-origin-when-cross-origin`, Permissions-Policy và CSP enforced. CSP hiện cho phép `unsafe-inline`, `unsafe-eval` cùng các nguồn HTTPS rộng; chưa có nonce/hash theo request. Siết policy cần browser verification và kiểm tra hydration/styles.

Trang chính và luồng đặt sân dùng giao diện chuyển từ HTML thiết kế được cung cấp: nền tối #060911, card kính #0b1220, nút neon #10e760, font Plus Jakarta Sans và icon SVG nội bộ. `ArenaShell` ghép canvas sóng tần số, grid/radial, header ba mục Trang chủ/Đặt sân/Lịch của tôi và footer; CSS `arena*.css` giới hạn bằng class riêng, không đổi form login đã có. Hero có chữ shimmer, ping và bốn ô thông tin; số sân lấy từ API, không gắn số liệu USAPA/Lux hoặc khuyến mãi giả. Catalog hai cột desktop, một cột mobile vẫn gọi `GET /api/courts`, có bộ lọc và loading/error/empty, không nối fallback showcase.

Booking MVP bật link `/courts/[courtId]` mặc định; `NEXT_PUBLIC_COURT_DETAILS_ENABLED=false` tắt entry. Route `/booking` mới chọn sân trong danh mục thật; `/courts/[courtId]` giữ deep link và dùng cùng `CourtInfoCard`/`LiveBookingPanel`. Layout có dải bảy ngày, tabs sân, ma trận giờ, dịch vụ và tóm tắt thanh toán sticky hai cột; mobile một cột. Gallery sân vẫn xem được trong khối mở rộng. Giờ gợi ý chưa kiểm tra không tự nhận là còn trống hoặc cao điểm. Coupon có hình thức input/nút nhưng disabled, ghi rõ chưa hỗ trợ vì chưa có contract. Trang `/bookings` dùng thẻ dạng vé hai phần và bộ lọc trạng thái trên các record đã tải; chưa có QR/PIN check-in thì chỉ hiện mã booking và giải thích, không vẽ QR giả. Hủy HOLDING có hộp xác nhận rồi gọi callback/API cũ, không hứa hoàn tiền; giữ reload/reconnect/phân trang và tab hóa đơn. Sau khi giữ chỗ, `BookingPaymentCheckout` hiển thị dữ liệu payment API; server quyết định giá, hạn giữ và kết quả thanh toán. Không có QR hoặc trạng thái thành công giả khi provider/API chưa cung cấp dữ liệu.

Trang chính bắt đầu với danh sách trống/loading rồi tải `loadCourtCatalog`. Session lookup và catalog dùng deadline 1.200 ms; lỗi catalog được báo ra UI. Lỗi session khác 401 giữ trạng thái unknown theo SECURITY. Caller hủy request khi unmount; response cũ không ghi đè phiên mới. Mutation booking không tự retry; client giữ key khi kết quả không rõ và gửi lại cùng thông tin sau khi kiểm tra lịch.

Catalog dùng `next/image` với `fill`, `sizes` và lazy loading mặc định. Hover/focus của card/ảnh dùng CSS; các animation mới được giữ theo mẫu và chỉ tạm dừng hiệu ứng liên tục bằng control của người dùng. Script `web:dev` chỉ định `--turbopack` và port 4001; không coi flag này là bằng chứng tăng tốc vì Next.js 16 đã mặc định dùng Turbopack.

Khi thêm luồng API, giữ loading, lỗi, empty và conflict state ở đúng contract; không tự giả định endpoint, DTO, permission hoặc trạng thái server. Tránh đưa business rule booking/payment vào component.

## Styling và cấu hình

Style hiện nằm ở `frontend/app/globals.css`, dùng CSS thường và custom properties cho màu, font, radius, shadow, transition. Repository không khai báo Tailwind trong dependencies hiện tại. Đừng ghi Tailwind là công cụ đang dùng nếu manifest chưa đổi.

Font toàn cục dùng Inter (`latin`, `vietnamese`) qua `next/font/google`, được tải khi build và phục vụ từ website; browser không tải font Google. Theme mặc định sáng khi chưa có lựa chọn lưu; lựa chọn sáng/tối đã lưu vẫn được giữ. Các route dùng ArenaShell áp dụng Plus Jakarta Sans self-host qua next/font, nền tối riêng không phụ thuộc lựa chọn theme toàn cục. Canvas sao công thức kinetic frequency của mẫu, cao 500px với tâm sóng ở giữa viewport (CSS top: calc(50% - 185px)); tương tác pointer dùng tọa độ tương đối theo canvas. Animation mặc định bật, gồm canvas, shimmer/ping/pulse, hover và chuyển cảnh; theo yêu cầu giữ animation, không tự tắt bằng reduced-motion hoặc viewport observer. Người dùng có thể tạm dừng các hiệu ứng liên tục; canvas chỉ đình chỉ khi tab ẩn và tự tiếp tục khi hiện. Cleanup hủy RAF và mọi listener, DPR giới hạn 2. Lựa chọn theme đã lưu của các khu vực ngoài ArenaShell không bị ghi đè; đăng ký/OTP giữ workflow mới và dùng palette chung. Login có CSS Module và nền canvas riêng theo mẫu user cung cấp. Xem [phạm vi giao diện và dependency API](FRONTEND-UI.md).

Auth dùng `/auth/login`, `/auth/register` và `/auth/verify-email` với các trang URL riêng. Login theo mẫu HTML user cung cấp: nền #060911 có canvas sóng xanh, lưới mờ và radial light; card kính tối rộng tối đa 440px, nút neon #10e760, font Plus Jakarta Sans self-host qua `next/font/google` chỉ ở route login. CSS Module login không thay style các trang khác. Canvas dừng khi tab ẩn, khi người dùng bấm tạm dừng hoặc bật reduced motion; RAF/listener được dọn khi rời trang. Form giữ API/session/OTP thật, hiển thị lỗi server trong thông báo có role alert, không tự báo thành công bằng timer. Tùy chọn “Ghi nhớ tên đăng nhập trên thiết bị này” mặc định tắt, chỉ lưu identifier khi gửi form (hoặc xóa khi bỏ chọn và gửi lại), không lưu mật khẩu/token và không kéo dài phiên 15 phút. Đăng ký thành công hoặc login đúng mật khẩu nhưng chưa xác minh chuyển sang OTP; email và proof gửi mã có hạn 10 phút được giữ trong sessionStorage của tab, không đưa email/mật khẩu/OTP/proof vào URL. Trang OTP tự gửi một lần khi vào với proof (chống gửi trùng trong StrictMode); gửi thành công hiển thị khung xanh `OTP đã được gửi thành công.` không nút đóng, fade và gỡ sau 4 giây, đồng thời đếm ngược nút gửi lại 10 giây. Lỗi gửi hiện thông báo lỗi, không hiện khung thành công. Animation tôn trọng `prefers-reduced-motion`. Login chỉ giữ link quên mật khẩu. Query `next` chỉ nhận các đường dẫn nội bộ trong allowlist (bao gồm `/booking` mới) và được giữ qua đăng ký/xác minh để quay lại sân hoặc tài khoản sau đăng nhập. `/auth/resend-verification` cũng hiển thị form OTP có thao tác gửi lại. Dialog guest vẫn độc lập với các trang auth.

Chỉ biến `NEXT_PUBLIC_*` mới được đưa vào bundle browser; không đặt secret trong biến public. Cấu hình API và cách chạy frontend nằm trong [PIPELINES.md](PIPELINES.md).
