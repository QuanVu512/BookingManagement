# Legal, privacy và chính sách booking

Tài liệu này định vị source cho developer. Nội dung JSON được gắn `PUBLISHED` không tự chứng minh owner đã duyệt pháp lý hoặc môi trường production đã sẵn sàng. Xem [điều kiện phát hành](RELEASE-REQUIREMENTS.md) cho phần còn mở.

## Trang và API hiện có

| Frontend route | Source / chức năng |
| --- | --- |
| `/privacy` | [Privacy page](../frontend/app/privacy/page.tsx): thông báo xử lý dữ liệu |
| `/terms` | [Terms page](../frontend/app/terms/page.tsx): điều khoản giao kết |
| `/cookies` | [Cookie page](../frontend/app/cookies/page.tsx): cookie và browser storage |
| `/refund-policy` | [Refund page](../frontend/app/refund-policy/page.tsx): hủy, cọc và hoàn tiền |
| `/privacy/requests`, `/account/privacy` | [Form](../frontend/app/privacy/requests/page.tsx) và [trang tài khoản](../frontend/app/account/privacy/page.tsx): tiếp nhận và xem yêu cầu quyền dữ liệu |
| `/support` | [Support page](../frontend/app/support/page.tsx): gửi phản ánh, tra cứu trạng thái |

[LegalContentController](../backend/src/modules/legal-content/presentation/legal-content.controller.ts) khai báo `GET /legal/policies`, `/legal/booking-offer`, `/legal/business`. [Bootstrap](../backend/src/main.ts) hiện không đặt global `/api` prefix. Business manifest đang `DRAFT_PENDING_OWNER`; endpoint business trả `503 BUSINESS_INFO_NOT_PUBLISHED` đến khi đủ điều kiện công bố. Không dùng thông tin mẫu làm danh tính doanh nghiệp thật.

Privacy API trên backend là `POST/GET /privacy/requests`, `GET /privacy/requests/:id`; guest dùng `/guest/bookings/:bookingId/privacy/requests` và `/:id`. Support API là `POST /support/cases`, `GET /support/cases/:codeOrId/status`. Các [privacy client](../frontend/features/privacy/api/privacy-service.ts) và [support client](../frontend/features/support/api/support-service.ts) hiện gọi đường dẫn tương đối `/api/...`; [Next config](../frontend/next.config.mjs) chưa khai báo rewrite tương ứng. Cần nối và kiểm chứng đường đi HTTP trước khi coi các trang này hoạt động xuyên frontend/backend.

## Nội dung và phiên bản chính sách

- Nội dung hiển thị nằm tại [frontend/content/legal](../frontend/content/legal/); bốn page hiện import trực tiếp JSON `vi/<kind>/v1.0.json`, render qua [PolicyDocument](../frontend/features/legal/components/policy-document.tsx). Chưa có route chọn phiên bản lịch sử bằng query.
- [Frontend manifest](../frontend/content/legal/manifest.json) và [backend manifest](../backend/src/modules/legal-content/content/policy-manifest.json) lưu descriptors, SHA-256 và `activeBookingBundle` (`bundle-2026-v1`). [FilePolicyCatalog](../backend/src/modules/legal-content/infrastructure/file-policy-catalog.ts) nạp/cache manifest; backend trả catalog, bundle và business projection. Packaging JSON khi chỉ chạy bản build cần được xác minh riêng; [Nest config](../backend/nest-cli.json) chưa khai báo copy asset này.
- Khi đổi chính sách đã công bố, thêm phiên bản nội dung và cập nhật cả hai manifest, hash, bundle, page imports và cookie policy version liên quan. Giữ phiên bản cũ để đối chiếu giao dịch; không sửa chứng cứ giao kết lịch sử.
- [Legal content check](../tools/legal-content-check.mjs) chạy bằng `node tools/legal-content-check.mjs` từ root. Nó đối chiếu các trường bundle chính, version và hash bytes của bốn JSON. Nó chưa kiểm chứng phê duyệt pháp lý, HTTP routing, lịch sử phiên bản hay toàn bộ ý nghĩa `contentHash`; hiện chưa được gọi trong `package.json` hoặc CI.

Booking snapshot hiện ghi `policyVersion = mvp-hold-v1` và `policyAcceptedAt` trong hai use case tạo hold; chưa gắn bundle/hash từ legal catalog. Member DTO yêu cầu `policyAccepted: true`; guest DTO chưa nhận xác nhận tương đương. Checkbox [TransactionTerms](../frontend/features/legal/components/transaction-terms.tsx) không thay xác thực acceptance phía server. Không backfill bằng chứng đồng ý cho giao dịch cũ.

## Cookie consent

[CookiePreferencesProvider](../frontend/features/cookie-consent/components/cookie-preferences-provider.tsx) gắn banner, dialog và tracker boundary vào root layout. Người dùng có thể chấp nhận tất cả, từ chối nhóm tùy chọn hoặc tùy chỉnh, rồi mở lại từ footer. [Consent model](../frontend/features/cookie-consent/model/consent.ts) luôn bật `necessary`, mặc định tắt `preferences`, `analytics`, `marketing`; lựa chọn lưu tại `localStorage` key `booking:cookie-consent` trong 180 ngày với schema/policy version.

[Preference storage](../frontend/features/cookie-consent/api/preference-storage.ts) xử lý storage không khả dụng, JSON lỗi, version khác và thời hạn đã hết; state dùng memory khi không ghi được storage. [OptionalTrackers](../frontend/features/cookie-consent/components/optional-trackers.tsx) hiện không nạp SDK nào kể cả khi chấp nhận. Khi thêm vendor, phải triển khai khởi tạo theo consent, thu hồi và dọn dữ liệu của vendor; hàm dọn hiện chỉ xóa localStorage prefix `booking:analytics`/`booking:marketing`. Không coi đây là bằng chứng đã kiểm thử tracker thực tế hay xóa cookie domain bên thứ ba.

Session, CSRF, OTP và guest booking token phục vụ chức năng bắt buộc; không xóa chúng khi người dùng từ chối analytics. Theme và nhớ identifier có thao tác lựa chọn riêng; xem [inventory](PRIVACY-DATA-INVENTORY.md).

## Quyền dữ liệu và hỗ trợ

[PrivacyRequestsModule](../backend/src/modules/privacy-requests/privacy-requests.module.ts) nối controller → use case → store. Member gửi yêu cầu qua JWT và CSRF; list/detail lấy subject từ session. Guest phải có `X-Booking-Access-Token` được xác minh và bind booking; biết mã booking hoặc số điện thoại không đủ.

[SubmitPrivacyRequestUseCase](../backend/src/modules/privacy-requests/application/submit-privacy-request.use-case.ts) tiếp nhận ACCESS/CORRECT/ERASE/WITHDRAW/RESTRICT/OBJECT/PROTECT/OTHER, giới hạn description 10–2000 ký tự. Member vào `UNDER_REVIEW`, guest vào `AWAITING_VERIFICATION`; [detail use case](../backend/src/modules/privacy-requests/application/get-own-request.use-case.ts) kiểm tra ownership. Mốc 30 ngày trong source là giá trị mặc định kỹ thuật, chưa phải lịch pháp lý đã được duyệt.

Store được inject là [InMemoryPrivacyRequestStore](../backend/src/modules/privacy-requests/infrastructure/in-memory-privacy-request-store.ts): restart làm mất hồ sơ. Domain có transition/events, nhưng chưa có persistence Prisma, staff fulfilment API, export, challenge ngoài kênh hay purger. [SupportModule](../backend/src/modules/support/support.module.ts) cũng dùng store trong memory; endpoint tra cứu trạng thái bằng mã chưa có subject authentication. Hai luồng này không chứng minh đã có workflow quyền dữ liệu hoàn chỉnh.

[ProfileController](../backend/src/modules/users/presentation/profile.controller.ts) chỉ cho đọc/sửa hồ sơ của chính mình; email, phone, roles không sửa qua PATCH profile. Chưa có use case đóng tài khoản được nối trong [UserModule](../backend/src/modules/users/user.module.ts). Enum `CLOSED` không tự thực thi đóng, xóa hay ẩn danh. Retention và bước xác minh nhạy cảm cần được duyệt trước khi triển khai; không hard-delete sổ booking/payment/refund.

## Chính sách booking đã duyệt

Áp dụng cho booking mới của cả Member và Guest:

- Bắt buộc đặt cọc **đúng 30% giá thuê sân**, không có lựa chọn trả trước 100%. Phần còn lại xử lý theo luồng thu số dư. Cấu trúc policy trong database vẫn giữ khả năng mở rộng.
- Hủy **tại hoặc trước T−12h** (còn ít nhất 12 giờ đến lúc bắt đầu): giữ 10% giá thuê sân, hoàn 20% từ khoản cọc 30%.
- Hủy **sau T−12h** hoặc `NO_SHOW`: mất khoản cọc 30%. Không cộng thêm phí hủy thường 10%.
- Các tỷ lệ cọc/phạt trên không tính dịch vụ bổ sung. Ví dụ giá sân 1.000.000 VNĐ: cọc 300.000; hủy đúng hạn giữ 100.000, hoàn 200.000; hủy muộn/no-show mất 300.000.
- Không viết lại giao dịch lịch sử, số tiền, snapshot hoặc policy acceptance đã ghi. Xử lý hoàn tiền dựa trên tiền thực đã xác minh và nghĩa vụ đã giữ/hoàn; tạo refund request không đồng nghĩa đã chuyển tiền.

| Nghiệp vụ | Source thực thi hiện tại |
| --- | --- |
| Member hold, cọc và snapshot | [CreateHoldUseCase](../backend/src/modules/bookings/application/create-hold.use-case.ts), [DTO](../backend/src/modules/bookings/presentation/dto/booking-request.dto.ts) |
| Guest hold, cọc và token | [GuestCreateHoldUseCase](../backend/src/modules/payments/application/guest-create-hold.use-case.ts), [guest DTO/controller](../backend/src/modules/payments/presentation/guest-bookings.controller.ts) |
| Giá và cấu trúc snapshot | [Prisma schema](../backend/prisma/schema.prisma): Booking/BookingPriceItem; các create-hold use case dùng quote từ court schedule |
| Làm tròn VND, tạo yêu cầu thu | [Money domain](../backend/src/modules/payments/domain/money.ts), [CreatePaymentRequestUseCase](../backend/src/modules/payments/application/create-payment-request.use-case.ts) |
| Quote/apply hủy thường | [Cancellation policy](../backend/src/modules/bookings/domain/cancellation-policy.ts), [request](../backend/src/modules/bookings/application/request-paid-cancellation.use-case.ts), [apply](../backend/src/modules/bookings/application/apply-paid-cancellation.use-case.ts) |
| Hủy muộn/no-show | [Deposit forfeiture](../backend/src/modules/bookings/domain/deposit-forfeiture.ts), [staff late cancel](../backend/src/modules/bookings/application/staff-late-cancel.use-case.ts), [mark no-show](../backend/src/modules/bookings/application/mark-no-show.use-case.ts), [settle](../backend/src/modules/bookings/application/settle-eligible-bookings.use-case.ts) |

Hai create-hold use case hiện chỉ cho 30%. Payment domain/DTO vẫn có kiểu 30/100 để tương thích và payment request đối chiếu snapshot; sự tồn tại của 100 trong cấu trúc không cấp lựa chọn 100% cho booking mới. Công thức hiện lấy `totalAmount` từ quote sân; khi bổ sung dịch vụ phải giữ riêng base giá sân để không phạt trên dịch vụ.

**Điểm lệch cần xử lý trước release:** `isInLateCancelWindow` dùng `now >= startsAt − 12h`, nên đúng T−12h đang bị xếp hủy muộn. Policy JSON còn tiêu đề “trên 12 tiếng”. Cả hai cần khớp ranh giới đã duyệt ở trên; cleanup tài liệu không sửa runtime hay policy JSON. Xem [release requirements](RELEASE-REQUIREMENTS.md).

## Bảo mật và bảo vệ dữ liệu

Giữ ownership ở API, JWT/CSRF cho member mutation và token scope booking cho guest; xem [SECURITY](SECURITY.md). Không ghi raw token, mật khẩu, OTP, credential provider hoặc tài khoản ngân hàng đầy đủ vào logs/public docs. Webhook chỉ có tác dụng sau xác minh; redirect thanh toán không chứng minh đã nhận tiền. Payload webhook, SDK errors, quyền reviewer, retention và backup cần được kiểm chứng theo [inventory](PRIVACY-DATA-INVENTORY.md) trước vận hành thương mại.
