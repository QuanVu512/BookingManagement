# Bảo mật, xác thực và quyền

Hành vi dưới đây được triển khai trong auth source. Tests với mocks, HTTP guards thật và storage thật có phạm vi chứng minh khác nhau; test xanh không chứng minh cấu hình production hoặc khả năng gửi thư của nhà cung cấp.

## Session và account state

- Login tìm username/email/phone, verify Argon2 (kể cả dummy hash tính sẵn khi user thiếu), yêu cầu `ACTIVE` và `emailVerifiedAt` khác null. Hash/verify dùng chung bulkhead tối đa 4 tác vụ/process, overflow trả 429, không có hàng đợi vô hạn. JWT access token/cookie có thời hạn **15 phút**, chứa `sub`, `jti` random UUID và `tokenVersion`; pin HS256, issuer `booking-api`, audience `booking-web`; không dùng role claim để quyết định quyền.
- `JwtStrategy` hỗ trợ cookie `access_token` hoặc Bearer. Mỗi request được JWT guard bảo vệ kiểm tra Redis denylist rồi đọc user/status/version/roles hiện tại từ Prisma. User deleted, inactive, revoked hoặc version không khớp bị từ chối; Redis/DB lỗi thì fail closed.
- Logout được JWT + CSRF bảo vệ: ghi revoke `jti` trong Redis với TTL bằng thời gian token còn lại, rồi mới clear cookie và trả success. Bản sao token vẫn bị từ chối sau logout. Reset password tăng `User.tokenVersion`, vô hiệu access token trước đó trên mọi thiết bị.
- Cookie là HttpOnly, `path=/`; production Secure + SameSite=None để hỗ trợ frontend/backend cross-site, môi trường khác SameSite=Lax. Cross-site browser deployment vẫn phụ thuộc chính sách third-party cookies của browser.
- `JWT_SECRET` bắt buộc ở **mọi environment**: 32 byte random mã hóa 64 ký tự hex; reject missing/blank/placeholder/format sai, quá ít ký tự khác nhau và chuỗi lặp. Validation không chứng minh entropy thực: secret phải được tạo bằng CSPRNG, cấu hình riêng dev/test/deploy và không đưa vào source/log. Không có fallback runtime.

## CSRF và CORS

- `WEB_ORIGIN` bắt buộc là một origin duy nhất: HTTPS ở production; HTTP chỉ cho loopback ở dev/test. `NEXT_PUBLIC_API_URL` cũng được kiểm tra khi build frontend và không có fallback production. CORS bật credentials cho origin này; CORS không thay thế CSRF. TLS có thể terminate ở reverse proxy; hop nội bộ không bắt buộc tự terminate TLS.
- `GET /api/auth/csrf` trả token random 32 byte, `Cache-Control: no-store`; Redis lưu SHA-256 của token và context cookie random với TTL **30 phút**. Context cookie HttpOnly theo cùng Secure/SameSite topology. Client lấy token trước mutation và gửi `X-CSRF-Token` cùng credentials.
- Guard áp dụng nhất quán cho POST login/register/logout/verify-email/resend-verification/forgot-password/reset-password. Token và context phải khớp; Origin phải bằng chính xác `WEB_ORIGIN`. Chỉ fallback sang origin của Referer khi Origin thiếu. Thiếu/sai cả hai hoặc token missing/invalid/expired trả 403.
- GET `/me` và `/csrf` không cần CSRF token; `/me` vẫn cần JWT. Token CSRF không lưu trong localStorage và không log.

## Password và auth throttling

- Password login/register/reset: **12–128 Unicode code point**, cho phép Unicode/khoảng trắng/passphrase; giữ nguyên giá trị, không trim hoặc normalize và không ép nhóm ký tự. Max được kiểm tra trước Argon2 hash/verify. Confirmation phải khớp ở register/reset. Frontend/backend có cùng giới hạn; backend là authority.
- Register/reset kiểm tra [HIBP Pwned Passwords range API](https://haveibeenpwned.com/API/v3#PwnedPasswords): chỉ gửi SHA-1 prefix 5 ký tự, so suffix ở server, bật padding; không gửi plaintext/full hash. Deadline **3 giây**; timeout, HTTP error hoặc dữ liệu sai trả 503 thay vì bypass. Compromised password bị từ chối; login không gọi HIBP.
- Redis counters atomic `INCR`/`EXPIRE`, namespace `booking:auth:v1:rate`: login IP **20/60 giây**, login normalized identifier hash **5/300 giây**, register IP **5/3600 giây**. Keys độc lập, không chứa raw identifier/IP; 429 kèm `Retry-After`. Hết TTL cho phép thử lại; không permanent lockout. Redis error fail closed.
- Global throttler **60/60 giây** vẫn giữ nguyên. `TRUSTED_PROXY` trống mặc định không tin proxy; chỉ cấu hình đúng IP/CIDR của proxy thực. Không chấp nhận `true`, hop count hoặc CIDR `/0`; upstream proxy phải loại bỏ header giả mạo trước API.
- Metadata policy thay tên handler: recovery IP 5/phút (forgot/resend dùng chung), verify/reset IP 10/phút dùng chung. Redis recipient quota theo email normalized + purpose: cooldown 60 giây, tối đa 3/giờ, kể cả email không tồn tại; suppression trả generic response. Quota mail toàn dịch vụ chia sẻ qua Redis, `AUTH_MAIL_MAX_PER_HOUR` bắt buộc là số nguyên dương do operator xác định ở production; dev/test mặc định 60. Tối đa 4 delivery/process; công việc I/O còn pending tiếp tục giữ slot, không mở vô hạn sau deadline response.
- Redis auth client có error listener chỉ log mã ngữ cảnh, offline queue tắt, queue tối đa 100, connect timeout 1 giây, socket inactivity timeout 1,5 giây, heartbeat 0,5 giây và tối đa 4 retry reconnect. Không retry consume/revoke ở application. Sau khi hết reconnect budget cần operator phục hồi/restart process; không flush state. Đây không phải policy kết nối của BullMQ.

## Verification và recovery

- Register normalize username/email/phone/fullName, dùng Argon2 và transaction/unique constraints hiện có. Username trùng trả 409 theo contract UX đã chọn; email/phone trùng (kể cả unique race) dùng cùng response 201 `{ success, status: "verification_required", message }` như input mới. Không sửa/merge account cũ và **không cấp auth cookie hoặc user session**. Message chỉ nói hướng dẫn sẽ được gửi nếu thông tin phù hợp; không khẳng định đã tạo account/gửi mail. Delivery lỗi giữ tài khoản unverified để resend. HIBP/hash chạy trước kiểm tra conflict; response đăng ký có thời gian tối thiểu 3,5 giây. Không coi padding là bằng chứng phân phối timing qua mạng tương đương dưới mọi tải.
- POST `/verify-email` nhận token; `/resend-verification` và `/forgot-password` nhận email; `/reset-password` nhận token/password/confirmPassword. DTO whitelist và validation vẫn áp dụng.
- Token CSPRNG 32 byte, Redis key chứa SHA-256 hash, payload chỉ id/email/version; verification TTL **24 giờ**, reset TTL **30 phút**. Token purpose tách biệt; [Redis GETDEL](https://redis.io/docs/latest/commands/getdel/) consume atomic, single-use. Không log token; không trả token qua API recovery.
- Verification update conditional theo id/email/version/ACTIVE và `emailVerifiedAt=null`. Reset kiểm tra token/account/password/HIBP trước hash, consume rồi conditional update passwordHash + increment version. Token replay hoặc account thay đổi bị từ chối. Hai reset token khác nhau cùng version chỉ một update thành công.
- Nếu DB write lỗi sau consume, token bị burn an toàn; yêu cầu link mới. Không bỏ qua consume hoặc khôi phục token để retry write.
- Forgot/resend luôn cùng status/body và deadline **3,5 giây** cho existing/missing/disabled/mail-failed account. Response không khẳng định đã gửi mail. Delivery lỗi chỉ log ngữ cảnh tổng quát, không account/token/provider credentials; công việc còn chờ I/O có thể kết thúc sau deadline response.
- [SMTP adapter](https://nodemailer.com/smtp) dùng cấu hình SMTP_* tường minh; send deadline **2,5 giây**, không debug/log message, không tải file/URL từ content. Production yêu cầu TLS. Link dựa trên `WEB_ORIGIN`, token nằm trong URL fragment; frontend lấy fragment vào memory rồi xóa khỏi URL. GET page không consume token: người dùng xác nhận bằng POST.

## Frontend auth

- `/me`: chỉ HTTP 401 là `unauthenticated`; success có payload hợp lệ là `authenticated`; network/timeout/5xx/malformed là `unknown`. Transient network/timeout/5xx retry tối đa **một lần**; không retry 401/400/429 hoặc malformed success.
- Mỗi session read timeout 1,2 giây (tối đa hai attempts). Login/register/logout/recovery có deadline tổng **10 giây**, gồm lấy CSRF và đọc response; mutation không tự retry.
- Unknown giữ user gần nhất để tránh giả logout, nhưng `isAuthenticated=false`; Header/Dashboard hiển thị trạng thái chưa xác nhận và nút retry. Revision guard tránh response cũ ghi đè login/logout mới.
- Register hiển thị chờ xác minh thay vì set user. Logout chỉ clear user/guest và chuyển màn hình sau success body của server; HTTP/network/timeout/malformed failure giữ state và hiển thị lỗi. Form loading được cleanup khi request kết thúc hoặc timeout.

## Authorization và rollout

- Roles: CUSTOMER/STAFF/MANAGER/ADMIN. `RolesGuard` giữ OR semantics của metadata `@Roles()` hiện có; không globalize hoặc tự gán roles vào route. Route không có role metadata không được suy ra là RBAC-protected. Guard dùng current DB roles do JWT strategy cấp.
- Không thêm refresh endpoint/rotation dù schema có `RefreshToken`. Không thêm MFA/OAuth/passkeys hoặc business authorization ngoài auth scope.
- Không có schema change/migration mới: reuse `emailVerifiedAt`/`tokenVersion`, Redis cho lifecycle. Account hiện có chưa verified phải xác minh; password legacy dưới 12 ký tự cần recovery theo policy mới. JWT cũ thiếu jti/version/issuer/audience không còn hợp lệ; rollout yêu cầu đăng nhập lại, không xóa denylist hoặc hạ validation để giữ phiên cũ. API/frontend cần phát hành cùng contract.
- Cấu hình JWT secret, WEB_ORIGIN, SMTP/TLS, Redis và trusted proxy theo `.env.example` trước rollout. `.env.example` chỉ là ví dụ local/placeholder, không credential deploy. Cần kiểm chứng SMTP provider và production topology riêng.

## Giới hạn ngoài auth

Bootstrap gắn `Cache-Control: no-store, private` cho `/api/auth` và các route con trước guard (kể cả 4xx/5xx), cùng nosniff/frame deny/referrer no-referrer. Swagger chỉ mount ngoài production; gateway realtime chưa dùng không được nạp. Frontend CSP là **Report-Only**, chưa bảo đảm chặn XSS; inline hydration/style cần nonce/hash và browser verification trước enforce. HSTS do edge owner cấu hình sau khi kiểm TLS/domain, không bật preload/includeSubDomains mặc định.

Audit port/adapter ghi các HTTP outcome login/register/logout/verify/reset/recovery, request ID UUID do server sinh, event code hữu hạn; không body/password/token/cookie/email/IP thô. `success` của generic recovery chỉ nghĩa là nhận request, không chứng minh mail được gửi. Counter tổng hợp chỉ theo event code, trong process; audit sink lỗi được đếm và không chặn revoke. Retention, quyền đọc và export metrics do operator cấu hình; chưa có durable audit store.

CI chạy storage suite với DB/Redis disposable và fail khi `AUTH_SECURITY_REQUIRE_STORAGE=true` mà thiếu URL. Dependency audit high trở lên chặn CI; source gate hiện là các pattern giới hạn (dynamic eval, unsafe raw query, interpolated shell, một số dạng credential), không thay SAST semantic, pentest hoặc secret scan toàn lịch sử. Advisory chưa khắc phục và kiểm chứng production còn thiếu phải giữ release gate mở.

Payment module còn rỗng; dependency provider không chứng minh webhook signature đang chạy. Schema guest booking token/đích hoàn tiền không chứng minh lifecycle hay encryption runtime. Xem [WORKFLOWS.md](WORKFLOWS.md) và [DATABASE.md](DATABASE.md) khi có task nghiệp vụ tương ứng; không suy thành cam kết bảo mật đã triển khai.
