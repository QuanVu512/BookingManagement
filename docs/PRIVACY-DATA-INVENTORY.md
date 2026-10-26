# Danh mục dữ liệu cá nhân

Inventory này mô tả source trong repository, không truy cập dữ liệu khách hàng. `Chưa xác minh` nghĩa là chưa có evidence về deployment, hợp đồng hoặc lịch lưu trữ; không được tự suy ra thời hạn hay quốc gia xử lý. Kiến trúc tại [LEGAL-AND-PRIVACY](LEGAL-AND-PRIVACY.md), các quyết định cần hoàn tất tại [RELEASE-REQUIREMENTS](RELEASE-REQUIREMENTS.md).

## Dữ liệu, mục đích và quyền truy cập

Nguồn cấu trúc bền vững là [Prisma schema](../backend/prisma/schema.prisma). Đường dẫn backend dưới đây nằm trong `backend/src/modules/`.

| Nhóm dữ liệu | Mục đích và lưu trữ hiện có | Truy cập / giới hạn retention |
| --- | --- | --- |
| Tài khoản: username, họ tên, email, phone, password hash | User/UserProfile trong PostgreSQL; đăng nhập, xác minh, recovery, liên hệ booking. Password confirmation chỉ dùng validation; hash mật khẩu dùng Argon2 | Auth và chính chủ; phone bắt buộc lúc đăng ký cần giải trình mục đích. Chưa có lịch purge tài khoản chưa xác minh/không hoạt động |
| OTP/recovery và session | Redis lưu proof/token hash, OTP HMAC, rate metadata, token revocation và CSRF; browser giữ cookie/token cho luồng tương ứng | Auth services; SMTP nhận email và nội dung OTP/reset. TTL kỹ thuật trong bảng dưới, chưa thay lịch retention DB/backup |
| Booking member/guest | Contact snapshot, userId nếu có, sân/giờ/giá, policyVersion/acceptedAt, history/occupancy trong PostgreSQL | Chính chủ hoặc guest có token và staff theo route; đổi profile không viết lại snapshot. Chưa có lịch lưu/xóa contact snapshot |
| Guest access credential | BookingAccessToken lưu SHA-256 token, purpose và hạn; raw token cấp một lần, UI giữ trong sessionStorage | Bind `MANAGE_BOOKING` và booking; [GuestTokenService](../backend/src/modules/payments/infrastructure/guest-token.service.ts). Không ghi raw token vào log/URL; hủy booking không tự thu hồi quyền xem refund |
| Hồ sơ tùy chọn | Họ tên/avatarUrl; [profile API](../backend/src/modules/users/presentation/profile.controller.ts) chỉ sửa các field cho phép, avatar có thể xóa bằng null | Chính chủ qua JWT/CSRF. Email/phone cần luồng xác minh riêng. Nếu render avatar URL ngoài, đánh giá hostname/network privacy trước |
| Payment và refund | PaymentRequest/Transaction/RefundRequest/RefundAttempt: số tiền, reference, trạng thái, actor, destination metadata, encrypted destination nếu cần và evidenceReference | Khách xem projection trong scope; staff tài chính theo route/role. Không public raw account/evidence. Chưa duyệt thời hạn từng loại chứng từ/destination |
| Webhook, audit và outbox | PaymentWebhookEvent payload/retry/error; audit actor/action/reason; outbox payload trong PostgreSQL | Backend worker/ops và role có quyền. [Webhook inbox](../backend/src/modules/payments/infrastructure/payos-webhook-inbox.ts) bỏ signature/checksum nhưng còn lưu phần lớn envelope; chưa phải allowlist PII. Chưa có lịch purge sau đối soát |
| NotificationDelivery | Schema có recipientEmail, payloadEncrypted, messageId, retries | Bảng có trong schema không chứng minh booking email pipeline đã hoạt động. Cần xác minh wiring và lịch purge payload retry |
| Privacy request và events | Type, description, contactEmail, user/booking binding, status, deadline, public notes và events | [Store hiện tại](../backend/src/modules/privacy-requests/infrastructure/in-memory-privacy-request-store.ts) là Map trong memory, mất khi restart. Member list/detail theo user; guest theo booking token. Chưa có persistent retention/fulfilment |
| Support case và events | Contact email/phone, bookingId tùy chọn, description, case code/status/notes | [Support module](../backend/src/modules/support/support.module.ts) dùng memory. API status theo mã hiện chưa xác thực subject; cần duyệt projection, chống enumeration và staff access trước release |

Không thu thêm CCCD, ngày sinh, sinh trắc học hay file đính kèm chỉ để đáp ứng checklist. Không dùng contact giao dịch cho marketing khi chưa có mục đích và workflow được duyệt. Free text, payload và logs có thể chứa PII; hash hoặc mã định danh liên kết vẫn cần bảo vệ.

## Cookie và browser storage

| Tên / công nghệ | Mục đích | Thời hạn kỹ thuật / source |
| --- | --- | --- |
| `access_token` cookie | Session bắt buộc | 15 phút; [auth constants](../backend/src/modules/auth/constants/auth-validation.constants.ts). Cookie attributes theo [SECURITY](SECURITY.md) |
| `auth_csrf_context` cookie | Bind CSRF context | 30 phút, cùng auth constants |
| OTP/proof/reset token | Xác minh email và recovery | OTP 5 phút; delivery proof 10 phút; reset 30 phút; legacy verify-email token 24 giờ trong constants. Kiểm đúng luồng khi thay TTL |
| `booking:cookie-consent` localStorage | Nhớ lựa chọn quyền riêng tư, không chứa userId/IP | 180 ngày; [consent model](../frontend/features/cookie-consent/model/consent.ts) và [storage adapter](../frontend/features/cookie-consent/api/preference-storage.ts) |
| `smash-arena-theme` localStorage | Theme do user chọn | Không có expiry trong [ThemeProvider](../frontend/context/theme-context.tsx) |
| `smash-arena:login-identifier` localStorage | Tùy chọn nhớ username/email/phone; chứa PII | [useLoginPreferences](../frontend/hooks/use-login-preferences.ts) mặc định không nhớ; không có expiry; bỏ chọn sẽ xóa khi lưu |
| `booking:verification-email`, `booking:verification-flow` sessionStorage | Email/proof cho OTP | Theo tab; [auth-navigation](../frontend/lib/auth-navigation.ts) xóa cả hai khi clear flow; server TTL riêng |
| `guest-manage-token:<bookingId>` sessionStorage | Quyền quản lý booking guest | Theo tab; server mặc định 30 ngày từ max(startsAt, now), cấu hình tối đa 90 ngày; memory fallback khi storage không khả dụng |

Chưa có analytics/marketing SDK được nạp trong [OptionalTrackers](../frontend/features/cookie-consent/components/optional-trackers.tsx). Không kê cookie GA/Meta giả định; cần kiểm network ở deployment thực, kể cả script do hạ tầng chèn. Từ chối optional tracking không xóa session, CSRF, verification hay guest token. Consent tại ứng dụng không điều khiển cookie trên domain trang thanh toán ngoài.

## Bên nhận và nhà cung cấp

| Bên nhận / evidence source | Dữ liệu và mục đích | Phần chưa xác minh |
| --- | --- | --- |
| payOS — [gateway adapter](../backend/src/modules/payments/infrastructure/payos-gateway.adapter.ts) | Order code, amount, description, return/cancel URL, expiry; webhook có thông tin đối soát/counterparty. Lệnh create link hiện không gửi buyer contact | Merchant agreement, vai trò xử lý dữ liệu, subprocessors, quốc gia, retention, hỗ trợ/xóa dữ liệu và hoạt động live |
| SMTP — [AuthMailService](../backend/src/modules/auth/services/auth-mail.service.ts) | Địa chỉ nhận và nội dung xác minh/recovery; Mailpit chỉ là công cụ local | Production provider, TLS, region, logs, retention, support access và DPA nếu cần |
| HIBP/Pwned Passwords — [service](../backend/src/modules/auth/services/compromised-password.service.ts) | Gửi 5 ký tự đầu SHA-1 kèm network metadata của server, dùng response padding; không gửi raw password hoặc full hash | Quốc gia, retention, điều khoản dịch vụ và đánh giá chuyển dữ liệu; prefix không đồng nghĩa hoàn toàn vô danh |
| Google Fonts — [root layout](../frontend/app/layout.tsx) | `next/font/google` dùng Inter/Plus Jakarta Sans; tải tại build rồi phục vụ font qua app | Build egress/cache, license đúng bản và network thực ở deployment; không suy ra có Google OAuth/analytics |
| Google Maps — link điều hướng tại UI | Người dùng chủ động mở bản đồ, phát sinh network metadata ngoài app | Điểm đến đúng cơ sở, điều khoản và xử lý phía Maps; link không tương đương iframe tracker |
| Hosting/API/PostgreSQL/Redis/CDN/backup/observability | Có thể xử lý toàn bộ dataset tương ứng khi được triển khai | Provider production, region kể cả backup, subprocessors, access, hợp đồng, logs và lịch hết hạn đều chưa xác minh |

URL nguồn ảnh sản phẩm trong [sources.json](../frontend/public/products/sources.json) là provenance, không chứng minh runtime gửi dữ liệu khách tới các trang đó hoặc có quyền sử dụng thương mại. Chưa có bằng chứng license/quyền ảnh sân `court-1.jpg`–`court-4.jpg`, ảnh overview AI dựa trên reference, ảnh sản phẩm, logo/icon hay license font đúng bản trong hồ sơ đã rà soát. Owner cần xác nhận quyền hoặc thay ảnh; metadata AI không tự chứng nhận bản quyền. Lưu bằng chứng hợp đồng/quyền sử dụng riêng tư ngoài public docs.

## Retention, xóa và ẩn danh

Chưa có schedule được duyệt cho User/Profile, booking/contact snapshot, ledger/refund, audit/webhook/outbox, notification, privacy/support và backup. Không áp một mốc “5 năm” hay “10 năm” chung cho mọi dữ liệu; finance/legal phải phân loại chứng từ, xác định căn cứ và thời hạn trước khi triển khai purge.

Với mỗi dataset, cần chốt trigger, duration, legal hold, thao tác xóa/ẩn danh, processor/backup, người duyệt và evidence thực thi. Khi có implementation, dùng preview/dry-run, batch có thể chạy lại và kiểm tra nghĩa vụ tài chính/hold trong transaction. Giữ IDs/FKs, số tiền, receipt/refund, thời điểm và chứng cứ giao kết cần lưu; không tạo email/phone giả để né non-null/unique/regex constraints.

Account `CLOSED`, thu hồi session, mã hóa và pseudonymization là các thao tác khác nhau, không tự chứng minh đã anonymize. Hiện chưa có account closure/purger được nối trong [UserModule](../backend/src/modules/users/user.module.ts). Yêu cầu ERASE hiện chỉ là intake/review state; không xóa ledger. Không cắt quyền guest khi refund còn mở nếu chưa có kênh thay thế được duyệt. Với backup, cần lịch expiry và quy trình áp lại suppression khi restore; không hứa xóa tức thì.
