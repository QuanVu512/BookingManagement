# Kiến trúc frontend

Frontend dùng Next.js App Router trong `frontend/`, React và TypeScript. Phiên bản khai báo và chính sách dependency nằm ở [TECH-STACK.md](TECH-STACK.md).

## Các vùng chính

| Đường dẫn                                                            | Vai trò hiện tại                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `frontend/app/`                                                      | Route `/`, `/dashboard`, layout và stylesheet toàn cục              |
| `frontend/components/auth/`                                          | Modal auth và xác nhận tiếp tục ở chế độ guest                      |
| `frontend/features/courts/`, `frontend/features/booking/`            | Luồng chọn sân, availability, giữ chỗ và booking của tôi            |
| `frontend/components/home/`                                          | Header, catalog sân và các khối trang chủ                           |
| `frontend/context/auth-context.tsx`                                  | Auth state, trạng thái modal, guest session và các lời gọi auth API |
| `frontend/services/auth.ts`, `frontend/services/courts.ts`           | Gọi HTTP, kiểm tra response và timeout/fallback cho các request đọc |
| `frontend/hooks/use-auth-form.ts`, `frontend/lib/auth-validation.ts` | State form, validation/chuẩn hóa và khóa submit trùng               |
| `frontend/types/`                                                    | Kiểu dữ liệu frontend                                               |

Feature có nhiều luồng độc lập ưu tiên cách tổ chức của Booking trong `frontend/features/<feature>/`: `components/`, `hooks/`, `api/`, `model/`. Panel/container ghép session, hook và view; view nhận props/callback; hook sở hữu state/interaction có cohesion; API service chỉ sở hữu HTTP và response contract. Không gom toàn bộ feature vào một service hoặc chuyển nguyên khối đó thành một hook tổng. Chỉ tách thêm component khi có trách nhiệm/dependency rõ, không tạo folder rỗng hoặc store toàn cục để đủ mẫu.

`AuthProvider` được đặt ở root layout. Những component dùng hook/state, event handler hoặc `AuthContext` phải là client component (`'use client'`); giữ component server khi không cần tương tác phía browser.

Auth state tách thành `useAuthSession`, `useAuthDialog` và `useAuthActions`. Header/dashboard chỉ đăng ký session và action ổn định; thay đổi trạng thái modal/guest không khiến Header render lại. `useAuth` vẫn cung cấp API kết hợp cho consumer cần cả ba nhóm.

Client kiểm tra sơ bộ email (dot-atom/quoted local part, domain DNS) và số Việt Nam (`03/05/07/08/09`, `02`, dạng `0…` hoặc `+84…`) bằng regex; không import `class-validator` hoặc metadata số điện thoại toàn cầu vào bundle. Đây không phải bộ phân tích toàn bộ RFC 5322 hay danh sách đầu số được cấp phát. Backend vẫn xác thực hợp lệ cuối cùng bằng DTO và regex đồng bộ với migration SQL. Form tự focus ô đầu, khóa input bằng fieldset khi gửi, hiển thị spinner và dùng khóa đồng bộ để ngăn submit trùng trước khi React cập nhật state.

## State và API

Chưa có thư viện state/API client riêng trong dependency. AuthContext ủy quyền HTTP cho service Auth; service gọi các route Nest:

- `GET /api/auth/me`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`

URL lấy từ `NEXT_PUBLIC_API_URL`; dev/test mặc định `http://localhost:4000`, production bắt buộc origin HTTPS hợp lệ và fail build nếu thiếu/sai. Auth request đặt `credentials: 'include'` để browser gửi/nhận cookie. Cookie do backend quản lý; frontend không đọc access token. Payload đăng ký có `confirmPassword`, chỉ dùng kiểm tra khớp tại backend. Form hiển thị message generic từ server cho đăng ký mới/trùng email/phone; username trùng vẫn là lỗi. Không suy ra account được tạo chỉ từ 201.

Next config đặt nosniff/frame deny/no-referrer và CSP Report-Only với API origin tường minh. Chưa enforce CSP cho inline Next hydration/styles; cần browser evidence và nonce/hash trước rollout enforce. Không bật unsafe-eval production.

Trang chính gọi `GET /api/courts`; không dùng fallback showcase. API lỗi hiển thị lỗi/thử lại, API trả `[]` hiển thị trống. Dữ liệu mẫu chỉ còn dùng trong pilot/fixture không được nối với luồng MVP chính.

Booking MVP bật link `/courts/[courtId]` mặc định; `NEXT_PUBLIC_COURT_DETAILS_ENABLED=false` tắt entry. Route `/courts/[courtId]` dùng `BookingScreen` để điều phối court detail và feature `frontend/features/booking/`: API/contract, hooks state và panel/view nằm trong feature; view chỉ render props. Trang `/bookings` dùng `MyBookingsPanel` cho xem/hủy/reload/reconnect. Server quyết định giá, thời hạn và trạng thái. Không có thanh toán/CONFIRMED trong flow này.

Trang chính bắt đầu với danh sách trống/loading rồi tải `loadCourtCatalog`. Session lookup và catalog dùng deadline 1.200 ms; lỗi catalog được báo ra UI. Lỗi session khác 401 giữ trạng thái unknown theo SECURITY. Caller hủy request khi unmount; response cũ không ghi đè phiên mới. Mutation booking không tự retry; client giữ key khi kết quả không rõ và gửi lại cùng thông tin sau khi kiểm tra lịch.

Catalog dùng `next/image` với `fill`, `sizes` và lazy loading mặc định. Hover/focus của card/ảnh dùng CSS, tắt chuyển động khi `prefers-reduced-motion: reduce`. Script `web:dev` chỉ định `--turbopack` và port 4001; không coi flag này là bằng chứng tăng tốc vì Next.js 16 đã mặc định dùng Turbopack.

Khi thêm luồng API, giữ loading, lỗi, empty và conflict state ở đúng contract; không tự giả định endpoint, DTO, permission hoặc trạng thái server. Tránh đưa business rule booking/payment vào component.

## Styling và cấu hình

Style hiện nằm ở `frontend/app/globals.css`, dùng CSS thường và custom properties cho màu, font, radius, shadow, transition. Repository không khai báo Tailwind trong dependencies hiện tại. Đừng ghi Tailwind là công cụ đang dùng nếu manifest chưa đổi.

Modal overlay dùng nền `rgba(7, 10, 17, 0.8)` không blur; content dùng `translate3d` và `will-change: opacity, transform`. Khi browser bật giảm chuyển động, animation bị tắt và `will-change` trở về `auto`.

Chỉ biến `NEXT_PUBLIC_*` mới được đưa vào bundle browser; không đặt secret trong biến public. Cấu hình API và cách chạy frontend nằm trong [PIPELINES.md](PIPELINES.md).
