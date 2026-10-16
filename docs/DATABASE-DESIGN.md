# Thiết kế CSDL đặt sân Pickleball

Ngày thiết kế/tra cứu: 2026-10-09. Data dictionary cho modular monolith; Prisma schema và migration v1 đã tạo, chưa áp dụng DB. Chỉ thiết kế luồng đặt sân cho một chi nhánh; chưa thêm bảng thương mại điện tử.

## Quy tắc nghiệp vụ

| Nội dung               | Quy tắc áp dụng                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Khoảng chơi            | Giờ bắt đầu/kết thúc linh hoạt. Không tự suy diễn rằng giờ chọn phải nằm trên lưới 15 phút.                                                                  |
| Vệ sinh                | Hai lượt cùng sân cách nhau ít nhất 15 phút. Booking 18:00–19:00 chiếm lịch 18:00–19:15; lượt tiếp theo sớm nhất 19:15.                                      |
| Có tài khoản           | Chọn trả trước 30% hoặc thanh toán đủ 100%.                                                                                                                  |
| Vãng lai               | Không tạo user giả; user_id NULL. Bắt buộc tên, email, điện thoại và thanh toán đủ 100% trước khi xác nhận booking.                                          |
| Giữ chỗ                | HOLDING trong 5 phút để hoàn tất khoản trả trước bắt buộc.                                                                                                   |
| Hủy                    | Trừ 10% tổng giá booking, hoàn phần tiền thực nhận còn lại. Tổng 1.000.000đ, đã trả 300.000đ: phí 100.000đ, hoàn 200.000đ. Đã trả 1.000.000đ: hoàn 900.000đ. |
| Xác nhận hủy           | Hiển thị chính sách, phí và tiền hoàn; chỉ hủy sau khi khách đồng ý. Lưu bằng chứng điều khoản và thời điểm đồng ý.                                          |
| Mốc được hủy           | Đang cần chốt: trước giờ chơi và chưa check-in, hoặc đến trước check-in kể cả quá giờ bắt đầu. Thiết kế hỗ trợ cả hai bằng cancellation_rule.                |
| Sau hủy                | Giải phóng lịch khi hủy đã được áp dụng. Refund xử lý riêng; lỗi hoàn tiền không tự phục hồi lịch booking.                                                   |
| Trả phần còn lại       | Nhân viên ghi nhận tiền mặt hoặc chuyển khoản thực nhận tại quầy. Đây là khoản BALANCE, khác với tiền đến sau khi HOLDING hết hạn.                           |
| Tiền đến sau hết hạn   | Lưu receipt và đưa vào đối soát/hoàn tiền; không tự xác nhận lại một booking EXPIRED/CANCELLED.                                                              |
| Lịch sử khách vãng lai | Booking vẫn được lưu trong hệ thống. Không có trang lịch sử gắn tài khoản; khách có thể truy cập một booking bằng link bí mật gửi qua email.                 |
| Một chi nhánh          | Giữ branches với một bản ghi để tránh đổi cấu trúc sau này. Chưa cần branch_memberships; MANAGER/STAFF hiện có quyền trong chi nhánh duy nhất.               |

Phí 10% là chính sách kinh doanh người dùng lựa chọn, không phải biểu phí payOS. Cần công bố rõ chính sách và lưu phiên bản khách đã chấp nhận. Hủy chưa được xác nhận thanh toán/HOLDING hết hạn không tự tạo phí phạt 10%. Chính sách hoàn phí khi sân chủ động hủy, no-show và hủy sau check-in chưa được chốt; không tự áp dụng phí khách hủy cho những trường hợp này.

## Kết quả tra cứu payOS

- Hủy link thu không có thao tác trả lại tiền đã nhận được mô tả.
- POST /v1/payouts tạo lệnh chi đến ngân hàng đích với chữ ký và idempotency key. PROCESSING chưa phải thành công.
- Kênh Chi là tính năng cần kích hoạt riêng. Hướng dẫn hiện tại mô tả liên kết ví Bảo Kim và chuẩn bị nguồn tiền chi. Cần xác minh điều kiện, phí và hạn mức thực tế của tài khoản merchant trước khi triển khai.
- Thiết kế hỗ trợ payout và hoàn thủ công; cần xác minh điều kiện merchant.
- Không mặc định biết tài khoản gửi: counterAccount chỉ được hỗ trợ với một số ngân hàng. Xác minh đích nhận hoàn.

Nguồn: [payOS API](https://payos.vn/docs/api/), [Kích hoạt Kênh Chi](https://payos.vn/dang-ky-dich-vu-chi-ho/). Không xác minh tài khoản merchant cụ thể và không gọi API thanh toán thật.

Với cọc 30%, tạo link thu đúng khoản 30%; trả đủ thì tạo link 100%. Không tạo link 100% rồi yêu cầu chuyển 30%: theo [FAQ payOS](https://payos.vn/docs/cau-hoi-thuong-gap/), một số liên kết VietQR Pro có thể từ chối hoặc ngân hàng hoàn lại khoản chuyển sai số tiền. Phải kiểm tra loại kênh thu merchant dùng; không áp dụng hành vi đó cho mọi phương thức chuyển khoản.

## Quy ước để điền sheet

- Mỗi bảng bên dưới có bốn cột: Tên cột / Kiểu PostgreSQL / Ràng buộc / Ý nghĩa.
- NN = NOT NULL. NULL = được để trống. PK, UQ, FK là khóa chính, duy nhất và khóa ngoại.
- Tất cả bảng nằm trong một DB PostgreSQL do DATABASE_URL chọn (local mặc định pickleball, Neon theo URL), schema public; FK giữa module là khóa ngoại vật lý trong cùng DB.
- UUID id có DEFAULT gen_random_uuid() PostgreSQL16; có thể cung cấp UUID trước insert. user_profiles.user_id nhận UUID từ users, không tự sinh.
- Tiền dùng NUMERIC(14,0), đơn vị đồng VND. Không dùng float. Giá theo phút phải được tính chính xác rồi làm tròn theo một quy tắc nhất quán trước khi chốt tiền.
- Tỷ lệ phần trăm dùng NUMERIC(5,2), ví dụ 30.00 hoặc 10.00.
- Thời điểm dùng TIMESTAMPTZ, hiển thị theo branches.timezone. Lịch mở cửa lặp tuần dùng TIME và thứ ISO: 1 = thứ Hai, 7 = Chủ nhật.
- Trạng thái/role trong v1 dùng enum PostgreSQL. CHECK/exclusion/partial indexes được giữ trong migration SQL.
- created_at mặc định NOW(). updated_at dùng Prisma @updatedAt và trigger SQL touch_updated_at.
- Không xóa cứng booking, receipt hay refund để sửa số liệu. Quyền lưu/ẩn thông tin cá nhân và thời hạn lưu dữ liệu cần chính sách riêng; guest không có tài khoản không có nghĩa lưu vô thời hạn.
- Hồ sơ cá nhân chung nằm ở user_profiles; không nhân đôi full_name/email/phone theo vai trò. user_roles cho phép một người vừa CUSTOMER vừa STAFF/MANAGER.

## Danh sách 21 bảng nghiệp vụ

| Module sở hữu      | Bảng                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Nhóm Auth          | users, user_roles, refresh_tokens                                                                                              |
| Nhóm Users         | user_profiles                                                                                                                  |
| Nhóm Courts        | branches, courts, branch_business_hours, price_rules                                                                           |
| Nhóm Bookings      | bookings, court_occupancies, booking_price_items, booking_status_history, booking_access_tokens, booking_cancellation_requests |
| Nhóm Check-in      | booking_checkins                                                                                                               |
| Nhóm Payments      | payment_requests, payment_transactions, payment_webhook_events, refund_requests, refund_attempts                               |
| Nhóm Notifications | notification_deliveries                                                                                                        |

Các nhóm là module trong một backend/một DB. V1 thêm outbox_events cho tác vụ BullMQ tin cậy, chưa có inbox_events hay broker liên dịch vụ.

## Nhóm Auth

### users — tài khoản đăng nhập

| Tên cột           | Kiểu PostgreSQL    | Ràng buộc                 | Ý nghĩa                                                       |
| ----------------- | ------------------ | ------------------------- | ------------------------------------------------------------- |
| id                | UUID               | PK                        | ID tài khoản                                                  |
| username          | VARCHAR(100)       | NULL, UQ                  | Tên đăng nhập tùy chọn; bỏ nếu chỉ đăng nhập email/điện thoại |
| phone             | VARCHAR(20)        | NN, UQ                    | Số điện thoại đăng nhập, chuẩn hóa thống nhất                 |
| email             | VARCHAR(254)       | NULL, UQ                  | Email tài khoản; booking vẫn bắt buộc email snapshot          |
| password_hash     | VARCHAR(255)       | NN                        | Hash mật khẩu                                                 |
| status            | user_status (ENUM) | NN, DEFAULT ACTIVE        | ACTIVE, SUSPENDED, CLOSED                                     |
| phone_verified_at | TIMESTAMPTZ        | NULL                      | Thời điểm xác minh điện thoại                                 |
| email_verified_at | TIMESTAMPTZ        | NULL                      | Thời điểm xác minh email                                      |
| token_version     | INTEGER            | NN, DEFAULT 0, CHECK >= 0 | Phiên bản thu hồi token khi cần                               |
| created_at        | TIMESTAMPTZ        | NN, DEFAULT NOW()         | Tạo tài khoản                                                 |
| updated_at        | TIMESTAMPTZ        | NN, DEFAULT NOW()         | Cập nhật tài khoản                                            |

username/email cần quy định chuẩn hóa và uniqueness không phân biệt hoa thường ở bước triển khai. Không tạo users cho khách vãng lai. Bỏ full_name, role, is_active cũ sau khi chuyển sang profile, user_roles và status.

### user_profiles — thông tin cá nhân chung

| Tên cột    | Kiểu PostgreSQL | Ràng buộc         | Ý nghĩa                     |
| ---------- | --------------- | ----------------- | --------------------------- |
| user_id    | UUID            | PK, FK → users.id | Một hồ sơ cho mỗi tài khoản |
| full_name  | VARCHAR(150)    | NN                | Họ tên hiển thị             |
| avatar_url | TEXT            | NULL              | Đường dẫn ảnh đại diện      |
| created_at | TIMESTAMPTZ     | NN, DEFAULT NOW() | Tạo hồ sơ                   |
| updated_at | TIMESTAMPTZ     | NN, DEFAULT NOW() | Cập nhật hồ sơ              |

Không thêm ngày sinh, giới tính, CCCD hoặc địa chỉ khi chưa có nhu cầu. Chưa có dữ liệu đặc thù cần customer_profiles/staff_profiles riêng. Màn hình hồ sơ khách và quản lý có thể dùng cùng bảng này. Sau này staff_profiles chỉ thêm dữ liệu công việc, customer_profiles chỉ thêm dữ liệu đặc thù khách hàng, không sao chép thông tin chung.

### user_roles — nhiều vai trò trên cùng tài khoản

| Tên cột             | Kiểu PostgreSQL | Ràng buộc                        | Ý nghĩa                                         |
| ------------------- | --------------- | -------------------------------- | ----------------------------------------------- |
| user_id             | UUID            | NN, FK → users.id, thành phần PK | Tài khoản nhận quyền                            |
| role                | role (ENUM)     | NN, thành phần PK                | CUSTOMER, STAFF, MANAGER, ADMIN                 |
| assigned_by_user_id | UUID            | NULL, FK → users.id              | Người cấp quyền; NULL khi hệ thống cấp CUSTOMER |
| created_at          | TIMESTAMPTZ     | NN, DEFAULT NOW()                | Thời điểm cấp quyền                             |

PK ghép (user_id, role). STAFF thu tiền/check-in; MANAGER phê duyệt hoàn tiền và quản lý. User không được tự cấp quyền ngoài CUSTOMER. Khi có nhiều chi nhánh mới thêm branch_memberships; profile không cấp quyền.

### refresh_tokens — phiên đăng nhập và token rotation

| Tên cột              | Kiểu PostgreSQL | Ràng buộc                    | Ý nghĩa                                                       |
| -------------------- | --------------- | ---------------------------- | ------------------------------------------------------------- |
| id                   | UUID            | PK                           | ID token/phiên                                                |
| user_id              | UUID            | NN, FK → users.id            | Chủ phiên                                                     |
| token_hash           | CHAR(64)        | NN, UQ                       | SHA-256 hex của token ngẫu nhiên đủ mạnh; không lưu token gốc |
| token_family_id      | UUID            | NN, INDEX                    | Nhóm token trong chuỗi rotation                               |
| expires_at           | TIMESTAMPTZ     | NN                           | Hết hạn                                                       |
| revoked_at           | TIMESTAMPTZ     | NULL                         | Thời điểm thu hồi                                             |
| revoke_reason        | VARCHAR(100)    | NULL                         | Đăng xuất, đổi mật khẩu, phát hiện reuse…                     |
| replaced_by_token_id | UUID            | NULL, FK → refresh_tokens.id | Token thay thế khi rotation                                   |
| created_at           | TIMESTAMPTZ     | NN, DEFAULT NOW()            | Tạo token                                                     |

Index (user_id, expires_at). CHECK expires_at > created_at. Hash token ngẫu nhiên khác với hash mật khẩu; mật khẩu vẫn dùng thuật toán password hashing.

## Nhóm Courts

### branches — chi nhánh; hiện chỉ một bản ghi

| Tên cột    | Kiểu PostgreSQL | Ràng buộc                    | Ý nghĩa                  |
| ---------- | --------------- | ---------------------------- | ------------------------ |
| id         | UUID            | PK                           | ID chi nhánh             |
| code       | VARCHAR(30)     | NN, UQ                       | Mã chi nhánh             |
| name       | VARCHAR(150)    | NN                           | Tên cơ sở                |
| address    | VARCHAR(500)    | NN                           | Địa chỉ                  |
| phone      | VARCHAR(20)     | NN                           | Điện thoại liên hệ       |
| timezone   | VARCHAR(50)     | NN, DEFAULT Asia/Ho_Chi_Minh | Múi giờ IANA             |
| is_active  | BOOLEAN         | NN, DEFAULT TRUE             | Chi nhánh đang hoạt động |
| created_at | TIMESTAMPTZ     | NN, DEFAULT NOW()            | Tạo                      |
| updated_at | TIMESTAMPTZ     | NN, DEFAULT NOW()            | Cập nhật                 |

Giờ mở/đóng cửa chuyển sang branch_business_hours.

### courts — sân con

| Tên cột         | Kiểu PostgreSQL     | Ràng buộc                   | Ý nghĩa                                   |
| --------------- | ------------------- | --------------------------- | ----------------------------------------- |
| id              | UUID                | PK                          | ID sân                                    |
| branch_id       | UUID                | NN, FK → branches.id        | Chi nhánh sở hữu                          |
| code            | VARCHAR(30)         | NN                          | Mã sân trong chi nhánh                    |
| name            | VARCHAR(100)        | NN                          | Tên sân                                   |
| court_type      | court_type (ENUM)   | NN, DEFAULT STANDARD        | STANDARD, VIP                             |
| status          | court_status (ENUM) | NN, DEFAULT ACTIVE          | ACTIVE, INACTIVE                          |
| cleanup_minutes | SMALLINT            | NN, DEFAULT 15, CHECK >= 15 | Khoảng vệ sinh; nghiệp vụ hiện cố định 15 |
| created_at      | TIMESTAMPTZ         | NN, DEFAULT NOW()           | Tạo                                       |
| updated_at      | TIMESTAMPTZ         | NN, DEFAULT NOW()           | Cập nhật                                  |

UQ (branch_id, code), index branch_id. Không dùng status MAINTENANCE thay cho một khoảng chặn lịch có thời gian.

### branch_business_hours — giờ mở cửa theo thứ

| Tên cột     | Kiểu PostgreSQL | Ràng buộc            | Ý nghĩa      |
| ----------- | --------------- | -------------------- | ------------ |
| id          | UUID            | PK                   | ID lịch      |
| branch_id   | UUID            | NN, FK → branches.id | Chi nhánh    |
| day_of_week | SMALLINT        | NN, CHECK 1..7       | Thứ ISO      |
| open_time   | TIME            | NULL có điều kiện    | Giờ mở cửa   |
| close_time  | TIME            | NULL có điều kiện    | Giờ đóng cửa |
| is_closed   | BOOLEAN         | NN, DEFAULT FALSE    | Nghỉ cả ngày |
| created_at  | TIMESTAMPTZ     | NN, DEFAULT NOW()    | Tạo          |
| updated_at  | TIMESTAMPTZ     | NN, DEFAULT NOW()    | Cập nhật     |

UQ (branch_id, day_of_week). Nếu is_closed = FALSE, cả hai giờ NN và close_time > open_time. Nếu TRUE, cả hai NULL. Bản này chưa hỗ trợ mở xuyên đêm hoặc nhiều ca trong một ngày. Lịch đóng cửa ngày lễ theo thời điểm được lưu thành BLOCK trong Booking.

### price_rules — bảng giá có ngày hiệu lực

| Tên cột        | Kiểu PostgreSQL | Ràng buộc            | Ý nghĩa                                       |
| -------------- | --------------- | -------------------- | --------------------------------------------- |
| id             | UUID            | PK                   | ID rule                                       |
| court_id       | UUID            | NN, FK → courts.id   | Sân áp dụng                                   |
| day_of_week    | SMALLINT        | NULL hoặc CHECK 1..7 | NULL = mọi thứ; cuối tuần tạo rule cho 6 và 7 |
| start_time     | TIME            | NN                   | Bắt đầu khung giá                             |
| end_time       | TIME            | NN                   | Kết thúc khung giá                            |
| price_per_hour | NUMERIC(14,0)   | NN, CHECK >= 0       | Giá/giờ VND                                   |
| effective_from | DATE            | NN                   | Ngày bắt đầu hiệu lực                         |
| effective_to   | DATE            | NULL                 | Ngày kết thúc, có bao gồm ngày này            |
| priority       | INTEGER         | NN, DEFAULT 0        | Rule cao hơn thắng khi nhiều rule khớp        |
| is_active      | BOOLEAN         | NN, DEFAULT TRUE     | Bật/tắt rule                                  |
| created_at     | TIMESTAMPTZ     | NN, DEFAULT NOW()    | Tạo                                           |
| updated_at     | TIMESTAMPTZ     | NN, DEFAULT NOW()    | Cập nhật                                      |

CHECK end_time > start_time, effective_to NULL hoặc >= effective_from. Không cho hai rule cùng độ ưu tiên tạo kết quả mơ hồ trên cùng sân/ngày/giờ. Không có rule hợp lệ thì không tự áp giá 0. Giá đã chốt của booking không tính lại khi bảng giá thay đổi.

## Nhóm Bookings

### bookings — đơn đặt sân, bao gồm khách vãng lai

| Tên cột                      | Kiểu PostgreSQL          | Ràng buộc                              | Ý nghĩa                                                                    |
| ---------------------------- | ------------------------ | -------------------------------------- | -------------------------------------------------------------------------- |
| id                           | UUID                     | PK                                     | ID booking                                                                 |
| booking_code                 | VARCHAR(32)              | NN, UQ                                 | Mã đơn hiển thị, không phải token truy cập                                 |
| user_id                      | UUID                     | NULL, FK → users.id                    | NULL = khách vãng lai                                                      |
| branch_id                    | UUID                     | NN, FK → branches.id                   | Chi nhánh; hiện một giá trị                                                |
| court_id                     | UUID                     | NN, FK → courts.id                     | Sân đã chọn                                                                |
| source                       | booking_source (ENUM)    | NN                                     | CUSTOMER_WEB, STAFF_COUNTER                                                |
| customer_name                | VARCHAR(150)             | NN                                     | Snapshot tên người đặt                                                     |
| customer_email               | VARCHAR(254)             | NN                                     | Snapshot email gửi thông báo/check-in                                      |
| customer_phone               | VARCHAR(20)              | NN                                     | Snapshot điện thoại liên hệ                                                |
| starts_at                    | TIMESTAMPTZ              | NN                                     | Bắt đầu chơi                                                               |
| ends_at                      | TIMESTAMPTZ              | NN                                     | Kết thúc chơi                                                              |
| cleanup_minutes              | SMALLINT                 | NN, DEFAULT 15, CHECK >= 15            | Snapshot khoảng vệ sinh tại lúc đặt                                        |
| total_amount                 | NUMERIC(14,0)            | NN, CHECK > 0                          | Tổng giá sân đã chốt                                                       |
| prepayment_percent           | NUMERIC(5,2)             | NN                                     | 30.00 hoặc 100.00                                                          |
| required_prepayment_amount   | NUMERIC(14,0)            | NN, CHECK > 0                          | Khoản cần nhận để xác nhận booking                                         |
| currency                     | CHAR(3)                  | NN, DEFAULT VND                        | Đồng tiền                                                                  |
| status                       | booking_status (ENUM)    | NN, DEFAULT HOLDING                    | HOLDING, CONFIRMED, CHECKED_IN, COMPLETED, EXPIRED, CANCELLED, NO_SHOW     |
| hold_expires_at              | TIMESTAMPTZ              | NN                                     | Deadline thanh toán khoản trả trước, giữ để audit kể cả đã xác nhận        |
| confirmed_at                 | TIMESTAMPTZ              | NULL                                   | Thời điểm xác nhận booking                                                 |
| cancellation_rule            | cancellation_rule (ENUM) | NN                                     | BEFORE_START hoặc BEFORE_CHECKIN; giá trị còn cần chốt                     |
| cancellation_deadline_at     | TIMESTAMPTZ              | NULL có điều kiện                      | starts_at cho BEFORE_START; NULL nếu chỉ giới hạn bởi check-in             |
| cancellation_penalty_percent | NUMERIC(5,2)             | NN, DEFAULT 10.00                      | Snapshot phí hủy/tổng giá sân                                              |
| policy_version               | VARCHAR(30)              | NN                                     | Phiên bản điều khoản đã chốt                                               |
| policy_accepted_at           | TIMESTAMPTZ              | NN                                     | Khách đồng ý điều khoản khi đặt                                            |
| cancelled_at                 | TIMESTAMPTZ              | NULL                                   | Thời điểm hủy thực tế                                                      |
| cancelled_by_user_id         | UUID                     | NULL, FK → users.id                    | NULL cho guest/hệ thống; đối chiếu actor_type trong lịch sử                |
| cancellation_reason          | TEXT                     | NULL                                   | Lý do hủy                                                                  |
| created_by_user_id           | UUID                     | NULL, FK → users.id                    | Nhân viên tạo tại quầy, nếu có                                             |
| idempotency_key              | VARCHAR(100)             | NN, UQ(user_id, key); partial UQ guest | Tránh tạo hai đơn do gửi lại request theo tài khoản; migration booking MVP |
| version                      | INTEGER                  | NN, DEFAULT 0, CHECK >= 0              | Kiểm soát sửa trạng thái đồng thời                                         |
| created_at                   | TIMESTAMPTZ              | NN, DEFAULT NOW()                      | Tạo                                                                        |
| updated_at                   | TIMESTAMPTZ              | NN, DEFAULT NOW()                      | Cập nhật                                                                   |

Ràng buộc:

- ends_at > starts_at; required_prepayment_amount <= total_amount. Đề xuất độ chính xác lịch đến phút: giây bằng 0 để duration_minutes là số nguyên; không yêu cầu bội số 15 phút.
- prepayment_percent thuộc {30.00, 100.00}; user_id NULL bắt buộc 100.00 và required_prepayment_amount = total_amount.
- required_prepayment_amount được tính từ giá đã chốt và tỷ lệ, với quy tắc làm tròn VND thống nhất.
- hold_expires_at > created_at và không vượt starts_at. Không nhận booking đã bắt đầu.
- BEFORE_START yêu cầu cancellation_deadline_at = starts_at; BEFORE_CHECKIN có deadline NULL nhưng kiểm tra trạng thái khi hủy.
- booking không chứa transaction_no, mã QR thanh toán hay check-in token gốc.
- Không lưu paid_amount/balance như nguồn sự thật độc lập. Các số này đến từ PaymentsModule; projection nếu thêm sau phải ghi rõ phiên bản cập nhật.
- Index (court_id, starts_at), (user_id, created_at), (status, hold_expires_at); thêm index customer_phone nếu có luồng tìm đơn theo điện thoại của nhân viên.

### court_occupancies — một nơi duy nhất bảo vệ lịch sân

| Tên cột            | Kiểu PostgreSQL        | Ràng buộc                  | Ý nghĩa                                     |
| ------------------ | ---------------------- | -------------------------- | ------------------------------------------- |
| id                 | UUID                   | PK                         | ID khoảng chiếm sân                         |
| court_id           | UUID                   | NN, FK → courts.id         | Sân                                         |
| booking_id         | UUID                   | NULL, UQ, FK → bookings.id | Booking sở hữu khoảng; NULL cho block       |
| kind               | occupancy_kind (ENUM)  | NN                         | BOOKING, BLOCK                              |
| occupied_from      | TIMESTAMPTZ            | NN                         | Bắt đầu khoảng chiếm lịch                   |
| occupied_until     | TIMESTAMPTZ            | NN                         | Kết thúc khoảng chiếm lịch, đã cộng vệ sinh |
| state              | occupancy_state (ENUM) | NN, DEFAULT ACTIVE         | ACTIVE, RELEASED                            |
| reason             | TEXT                   | NULL có điều kiện          | Bắt buộc cho BLOCK, ví dụ bảo trì/ngày lễ   |
| created_by_user_id | UUID                   | NULL, FK → users.id        | Người chặn lịch                             |
| released_at        | TIMESTAMPTZ            | NULL                       | Giải phóng do hủy/hết hạn                   |
| created_at         | TIMESTAMPTZ            | NN, DEFAULT NOW()          | Tạo                                         |
| updated_at         | TIMESTAMPTZ            | NN, DEFAULT NOW()          | Cập nhật                                    |

Thay court_blocks bằng bảng này để BOOKING và BLOCK cùng chịu một ràng buộc chống chồng lấn, thay vì kiểm tra hai bảng riêng.

- kind BOOKING: booking_id NN; occupied_from = booking.starts_at; occupied_until = booking.ends_at + cleanup_minutes.
- kind BLOCK: booking_id NULL; dùng đúng khoảng chặn, không tự cộng vệ sinh lần nữa.
- CHECK occupied_until > occupied_from.
- Exclusion constraint trên court_id và khoảng thời gian nửa mở [occupied_from, occupied_until), chỉ áp dụng state ACTIVE. Cần btree_gist cho so sánh UUID cùng range.
- Quy tắc đồng bộ thời gian với bookings phải được thực hiện trong cùng transaction/logic hoặc trigger được thiết kế sau; CHECK trên một bảng không tự kiểm tra được cột của bảng khác.
- Hủy/hết hạn: cập nhật booking và RELEASED occupancy trong cùng transaction DB pickleball.
- Không đặt NOW() trong predicate của exclusion constraint. Hold quá hạn vẫn cần được chuyển trạng thái/giải phóng bằng transaction. Khi job trễ, luồng nhận booking mới phải xử lý hold quá hạn an toàn trước khi chèn khoảng.
- COMPLETED/NO_SHOW có thể giữ occupancy lịch sử ACTIVE; khoảng đã ở quá khứ nên không ảnh hưởng các booking tương lai.
- Public availability chỉ trả khoảng giờ và loại bận/vệ sinh; không trả tên, email, điện thoại khách.

Nguồn kỹ thuật: [PostgreSQL 16 range/exclusion constraints](https://www.postgresql.org/docs/16/rangetypes.html).

### booking_price_items — chi tiết giá snapshot

| Tên cột          | Kiểu PostgreSQL | Ràng buộc                 | Ý nghĩa                  |
| ---------------- | --------------- | ------------------------- | ------------------------ |
| id               | UUID            | PK                        | ID dòng giá              |
| booking_id       | UUID            | NN, FK → bookings.id      | Đơn sở hữu               |
| price_rule_id    | UUID            | NULL, FK → price_rules.id | Rule gốc nếu còn tồn tại |
| starts_at        | TIMESTAMPTZ     | NN                        | Bắt đầu đoạn tính giá    |
| ends_at          | TIMESTAMPTZ     | NN                        | Kết thúc đoạn tính giá   |
| duration_minutes | INTEGER         | NN, CHECK > 0             | Thời lượng đoạn          |
| price_per_hour   | NUMERIC(14,0)   | NN, CHECK >= 0            | Giá/giờ đã chốt          |
| amount           | NUMERIC(14,0)   | NN, CHECK >= 0            | Tiền đoạn sau làm tròn   |
| description      | VARCHAR(255)    | NULL                      | Mô tả khung giá          |
| created_at       | TIMESTAMPTZ     | NN, DEFAULT NOW()         | Tạo snapshot             |

Index booking_id. Các đoạn phủ toàn bộ khoảng chơi, không trùng nhau; tổng amount bằng bookings.total_amount. 15 phút vệ sinh không tính là thời gian chơi được tính phí. Snapshot không sửa ngầm khi rule gốc đổi.

### booking_status_history — lịch sử thay đổi trạng thái

| Tên cột        | Kiểu PostgreSQL       | Ràng buộc            | Ý nghĩa                          |
| -------------- | --------------------- | -------------------- | -------------------------------- |
| id             | UUID                  | PK                   | ID lịch sử                       |
| booking_id     | UUID                  | NN, FK → bookings.id | Đơn                              |
| from_status    | booking_status (ENUM) | NULL                 | NULL cho trạng thái đầu tiên     |
| to_status      | booking_status (ENUM) | NN                   | Trạng thái mới                   |
| actor_type     | actor_type (ENUM)     | NN                   | SYSTEM, CUSTOMER, GUEST, STAFF   |
| actor_user_id  | UUID                  | NULL, FK → users.id  | Người thao tác nếu có tài khoản  |
| reason         | TEXT                  | NULL                 | Lý do nghiệp vụ                  |
| correlation_id | UUID                  | NULL                 | Liên kết request/job giữa module |
| created_at     | TIMESTAMPTZ           | NN, DEFAULT NOW()    | Thời điểm thay đổi               |

Index (booking_id, created_at). Ghi append-only trong transaction đổi trạng thái; không dùng việc có log để thay cho trạng thái hiện tại.

### booking_access_tokens — QR check-in và link quản lý guest

| Tên cột     | Kiểu PostgreSQL              | Ràng buộc            | Ý nghĩa                                  |
| ----------- | ---------------------------- | -------------------- | ---------------------------------------- |
| id          | UUID                         | PK                   | ID token                                 |
| booking_id  | UUID                         | NN, FK → bookings.id | Đơn được truy cập                        |
| purpose     | booking_token_purpose (ENUM) | NN                   | CHECKIN, MANAGE_BOOKING                  |
| token_hash  | CHAR(64)                     | NN, UQ               | SHA-256 hex của token ngẫu nhiên đủ mạnh |
| expires_at  | TIMESTAMPTZ                  | NN                   | Hết hạn theo mục đích token              |
| consumed_at | TIMESTAMPTZ                  | NULL                 | Token CHECKIN đã dùng                    |
| revoked_at  | TIMESTAMPTZ                  | NULL                 | Thu hồi khi hủy/cấp lại                  |
| created_at  | TIMESTAMPTZ                  | NN, DEFAULT NOW()    | Tạo                                      |

Index (booking_id, purpose). CHECK expires_at > created_at.

CHECKIN phát sau khi booking được xác nhận và dùng một lần. MANAGE_BOOKING có thể đọc nhiều lần trong thời hạn, không consumed ngay khi mở email. Token QR chỉ nhận diện booking; nhân viên vẫn phải đăng nhập và có quyền check-in. Link quản lý không cho truy cập lịch sử theo email/điện thoại và không tự liên kết booking guest vào tài khoản đăng ký sau này.

### booking_checkins — một lần check-in thành công

| Tên cột       | Kiểu PostgreSQL       | Ràng buộc                           | Ý nghĩa                                       |
| ------------- | --------------------- | ----------------------------------- | --------------------------------------------- |
| id            | UUID                  | PK                                  | ID check-in                                   |
| booking_id    | UUID                  | NN, UQ, FK → bookings.id            | Một check-in thành công mỗi đơn               |
| token_id      | UUID                  | NULL, FK → booking_access_tokens.id | QR đã dùng; NULL nếu xử lý thủ công được phép |
| staff_user_id | UUID                  | NN, FK → users.id                   | Nhân viên thực hiện                           |
| method        | checkin_method (ENUM) | NN                                  | QR, MANUAL                                    |
| checked_in_at | TIMESTAMPTZ           | NN, DEFAULT NOW()                   | Thời điểm check-in                            |
| note          | TEXT                  | NULL                                | Ghi chú trường hợp thủ công                   |

method QR yêu cầu token_id NN. Đổi trạng thái booking, consumed token và ghi check-in cùng một transaction. Không check-in CANCELLED/EXPIRED, token sai/hết hạn hoặc đơn chưa đáp ứng điều kiện thanh toán. Nếu cho phép nợ phần còn lại sau check-in thì cần nghiệp vụ riêng; thiết kế này đề xuất thanh toán đủ trước check-in.

Không lưu mọi lần quét trong bảng này. checkin_attempts chỉ thêm khi cần audit lần quét thất bại; chưa cần cho bản đầu.

### booking_cancellation_requests — báo phí, khách đồng ý rồi mới hủy

| Tên cột                         | Kiểu PostgreSQL                    | Ràng buộc            | Ý nghĩa                                                  |
| ------------------------------- | ---------------------------------- | -------------------- | -------------------------------------------------------- |
| id                              | UUID                               | PK                   | ID đề nghị/quote hủy                                     |
| booking_id                      | UUID                               | NN, FK → bookings.id | Đơn hủy                                                  |
| booking_version                 | INTEGER                            | NN, CHECK >= 0       | Phiên bản booking khi báo phí                            |
| total_amount_snapshot           | NUMERIC(14,0)                      | NN, CHECK > 0        | Tổng giá làm cơ sở tính 10%                              |
| paid_amount_snapshot            | NUMERIC(14,0)                      | NN, CHECK >= 0       | Tiền đã được xác minh và phân bổ cho đơn                 |
| refunded_amount_snapshot        | NUMERIC(14,0)                      | NN, CHECK >= 0       | Phần đã hoàn thành công trước đó                         |
| reserved_refund_amount_snapshot | NUMERIC(14,0)                      | NN, CHECK >= 0       | Tiền đã dành cho refund đang xử lý                       |
| penalty_percent                 | NUMERIC(5,2)                       | NN, DEFAULT 10.00    | Tỷ lệ phạt/tổng giá                                      |
| penalty_amount                  | NUMERIC(14,0)                      | NN, CHECK >= 0       | Phí phạt đã làm tròn                                     |
| refund_amount                   | NUMERIC(14,0)                      | NN, CHECK >= 0       | Khoản hoàn được thông báo                                |
| currency                        | CHAR(3)                            | NN, DEFAULT VND      | Đồng tiền                                                |
| policy_version                  | VARCHAR(30)                        | NN                   | Phiên bản chính sách                                     |
| policy_text_snapshot            | TEXT                               | NN                   | Nội dung chính sách/tiền phạt/tiền hoàn mà khách đã thấy |
| payment_snapshot_revision       | VARCHAR(100)                       | NN                   | Phiên bản dữ liệu/quote PaymentsModule dùng              |
| actor_type                      | actor_type (ENUM)                  | NN                   | CUSTOMER, GUEST, STAFF                                   |
| requested_by_user_id            | UUID                               | NULL, FK → users.id  | NULL nếu guest dùng link bảo mật                         |
| reason                          | TEXT                               | NULL                 | Lý do khách hủy                                          |
| status                          | cancellation_request_status (ENUM) | NN, DEFAULT QUOTED   | QUOTED, ACCEPTED, APPLIED, EXPIRED, SUPERSEDED, REJECTED |
| expires_at                      | TIMESTAMPTZ                        | NN                   | Hết hiệu lực quote                                       |
| accepted_at                     | TIMESTAMPTZ                        | NULL                 | Bằng chứng khách đồng ý                                  |
| applied_at                      | TIMESTAMPTZ                        | NULL                 | Hủy booking và giải phóng lịch thành công                |
| idempotency_key                 | VARCHAR(100)                       | NN, UQ               | Tránh xác nhận hai lần                                   |
| created_at                      | TIMESTAMPTZ                        | NN, DEFAULT NOW()    | Tạo quote                                                |
| updated_at                      | TIMESTAMPTZ                        | NN, DEFAULT NOW()    | Cập nhật                                                 |

Index (booking_id, created_at). Chỉ một request APPLIED cho một booking bằng partial UQ booking_id WHERE status = APPLIED.

- Phí phạt = 10% total_amount; tiền hoàn = max(0, paid_amount - refunded_amount - reserved_refund_amount - penalty_amount).
- Đây là bảng quote/consent, không phải receipt và không chứng minh tiền đã chuyển ra.
- Quote hết hạn, số tiền thay đổi, booking version thay đổi hoặc đã check-in: báo lại và lấy đồng ý mới; không tự chấp nhận quote cũ.
- Khi áp dụng hủy trong DB pickleball: CANCELLED booking + RELEASED occupancy + APPLIED request + history + outbox cùng transaction.
- PaymentsModule xử lý refund idempotent theo cancellation ID, kiểm tra/reserve tiền có thể hoàn trong transaction PostgreSQL. Các thay đổi booking/payment có thể cùng transaction PostgreSQL; gọi ngân hàng ở ngoài transaction.
- Khi Payment chưa xác minh được số liệu, không khẳng định refund đã hoàn tất. Sai khác từ event muộn phải được đối soát, không tạo khoản chi trùng.
- Phí 10% chỉ thu một lần theo cancellation đã áp dụng. Tiền mới đến sau hủy là receipt mới cần đối soát/hoàn; không tính thêm 10% lần nữa.
- Khách đã trả 30% thì tiền còn thiếu được xóa nghĩa vụ sau khi hủy, không yêu cầu trả tiếp 70%.

## Nhóm Payments

### payment_requests — yêu cầu thu tiền, có thể nhiều lần cho một booking

| Tên cột                  | Kiểu PostgreSQL               | Ràng buộc                     | Ý nghĩa                                                             |
| ------------------------ | ----------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| id                       | UUID                          | PK                            | ID yêu cầu thu                                                      |
| payment_code             | VARCHAR(32)                   | NN, UQ                        | Mã thu nội bộ                                                       |
| reference_type           | payment_reference_type (ENUM) | NN, hiện BOOKING              | V1 chỉ BOOKING; commerce cần thiết kế/migration tham chiếu mới      |
| reference_id             | UUID                          | NN, FK → bookings.id trong v1 | Booking cần thu                                                     |
| purpose                  | payment_purpose (ENUM)        | NN                            | PREPAYMENT, BALANCE                                                 |
| amount                   | NUMERIC(14,0)                 | NN, CHECK > 0                 | Số tiền cần thu cho yêu cầu này                                     |
| currency                 | CHAR(3)                       | NN, DEFAULT VND               | Đồng tiền                                                           |
| method                   | payment_method (ENUM)         | NN                            | PAYOS_TRANSFER, MANUAL_BANK_TRANSFER, CASH                          |
| provider                 | VARCHAR(30)                   | NULL                          | PAYOS cho yêu cầu qua API; NULL cho thu trực tiếp                   |
| provider_channel_id      | VARCHAR(100)                  | NULL                          | ID kênh thu dùng lúc tạo                                            |
| provider_order_code      | BIGINT                        | NULL có điều kiện             | orderCode số nguyên của payOS                                       |
| provider_payment_link_id | VARCHAR(100)                  | NULL                          | ID link do provider trả về                                          |
| checkout_url             | TEXT                          | NULL                          | URL thanh toán nếu có                                               |
| status                   | payment_request_status (ENUM) | NN, DEFAULT CREATING          | CREATING, PENDING, PARTIALLY_PAID, PAID, CANCELLED, EXPIRED, FAILED |
| expires_at               | TIMESTAMPTZ                   | NULL                          | Deadline link/hold; thu tại quầy có thể không cần                   |
| idempotency_key          | VARCHAR(100)                  | NN, UQ                        | Tránh tạo yêu cầu thu trùng                                         |
| created_by_user_id       | UUID                          | NULL, FK → users.id           | Nhân viên tạo yêu cầu tại quầy                                      |
| created_at               | TIMESTAMPTZ                   | NN, DEFAULT NOW()             | Tạo                                                                 |
| updated_at               | TIMESTAMPTZ                   | NN, DEFAULT NOW()             | Cập nhật                                                            |

Index (reference_type, reference_id), UQ (provider, provider_channel_id, provider_order_code) khi provider_order_code không NULL; kênh thu phải NN cho PAYOS_TRANSFER. UQ tương tự cho provider_payment_link_id trong cùng kênh.

provider_order_code phải nằm trong miền số nguyên an toàn được SDK/API chấp nhận khi gửi sang JavaScript; BIGINT trong DB không tự bảo đảm điều này. Yêu cầu thu không phải tiền thực nhận. Không tạo một receipt PENDING rồi bắt buộc có mã giao dịch ngân hàng.

Trả trước 100% dùng PREPAYMENT với amount = tổng giá; không cần tạo BALANCE bằng 0. Trả trước 30% dùng PREPAYMENT 30%, BALANCE thu phần thực tế còn thiếu. Thu nhiều lần thử được phép nhưng không phân bổ/thu vượt nghĩa vụ; khoản dư đi vào đối soát.

### payment_transactions — receipt tiền thực nhận và xác minh tại quầy

| Tên cột               | Kiểu PostgreSQL                    | Ràng buộc                      | Ý nghĩa                                                |
| --------------------- | ---------------------------------- | ------------------------------ | ------------------------------------------------------ |
| id                    | UUID                               | PK                             | ID receipt                                             |
| payment_request_id    | UUID                               | NULL, FK → payment_requests.id | NULL nếu nhận khoản chưa khớp đơn                      |
| provider              | VARCHAR(30)                        | NULL                           | PAYOS nếu từ provider                                  |
| method                | receipt_method (ENUM)              | NN                             | BANK_TRANSFER, CASH                                    |
| receiving_account_key | VARCHAR(100)                       | NN                             | Định danh tài khoản ngân hàng/quỹ tiền mặt nội bộ      |
| transaction_reference | VARCHAR(150)                       | NULL có điều kiện              | Mã giao dịch ngân hàng; NULL cho cash                  |
| amount                | NUMERIC(14,0)                      | NN, CHECK > 0                  | Số tiền thực nhận                                      |
| currency              | CHAR(3)                            | NN, DEFAULT VND                | Đồng tiền                                              |
| verification_status   | receipt_verification_status (ENUM) | NN, DEFAULT UNVERIFIED         | UNVERIFIED, VERIFIED, REJECTED                         |
| allocation_status     | receipt_allocation_status (ENUM)   | NN, DEFAULT UNALLOCATED        | UNALLOCATED, ALLOCATED, REFUND_REQUIRED                |
| confirmation_source   | confirmation_source (ENUM)         | NN                             | WEBHOOK, PROVIDER_QUERY, STAFF                         |
| funds_received_at     | TIMESTAMPTZ                        | NULL                           | Thời điểm tiền thực nhận theo nguồn đã kiểm tra        |
| recorded_by_user_id   | UUID                               | NULL, FK → users.id            | Người nhập thông tin tại quầy                          |
| verified_by_user_id   | UUID                               | NULL, FK → users.id            | Nhân viên xác nhận; NULL khi provider tự xác minh      |
| verified_at           | TIMESTAMPTZ                        | NULL                           | Thời điểm xác minh                                     |
| verification_note     | TEXT                               | NULL                           | Ghi chú đối soát/thủ công                              |
| evidence_reference    | TEXT                               | NULL                           | Tham chiếu chứng từ riêng tư, không phải ảnh công khai |
| review_reason         | TEXT                               | NULL                           | Khoản sai tiền, muộn, chưa khớp…                       |
| idempotency_key       | VARCHAR(100)                       | NN, UQ                         | Tránh nhân viên/webhook ghi lại receipt                |
| created_at            | TIMESTAMPTZ                        | NN, DEFAULT NOW()              | Server nhận/ghi receipt                                |
| updated_at            | TIMESTAMPTZ                        | NN, DEFAULT NOW()              | Cập nhật xác minh/phân bổ                              |

UQ (receiving_account_key, transaction_reference) khi transaction_reference không NULL, để cùng một bank receipt không bị ghi hai lần do STAFF và WEBHOOK. Index payment_request_id, (verification_status, created_at).

- Receipt BANK_TRANSFER đã VERIFIED cần mã giao dịch ngân hàng, funds_received_at và verified_at.
- Receipt STAFF đã VERIFIED cần verified_by_user_id. Receipt CASH cần người thu và xác nhận.
- Nút chuyển khoản của nhân viên nên tạo yêu cầu/QR hoặc kích hoạt kiểm tra trạng thái. Nếu xác nhận thủ công thì phải kiểm tra khoản thực nhận tại ngân hàng và ghi reference; ảnh chuyển khoản của khách không tự chứng minh tiền đã về.
- VERIFIED không có nghĩa booking tự được xác nhận: Payment phát dữ liệu đã xác minh, Booking kiểm tra còn HOLDING hợp lệ và đủ required_prepayment_amount.
- REFUND_REQUIRED dùng cho receipt đã về nhưng không thể phân bổ cho booking còn hiệu lực; không sửa thành FAILED để làm mất dấu tiền.
- REJECTED là dữ liệu xác nhận không được chấp nhận, không phải một giao dịch ngân hàng đã bị đảo. Receipt VERIFIED không sửa/xóa để thay cho hoàn tiền.

### payment_webhook_events — webhook thu/chi và xử lý lại

| Tên cột             | Kiểu PostgreSQL       | Ràng buộc                 | Ý nghĩa                                                                    |
| ------------------- | --------------------- | ------------------------- | -------------------------------------------------------------------------- |
| id                  | UUID                  | PK                        | ID lần nhận                                                                |
| provider            | VARCHAR(30)           | NN                        | PAYOS                                                                      |
| provider_channel_id | VARCHAR(100)          | NN                        | Kênh xác thực webhook                                                      |
| event_kind          | webhook_kind (ENUM)   | NN                        | PAYMENT, PAYOUT; chỉ dùng PAYOUT webhook nếu tích hợp được hỗ trợ xác minh |
| provider_reference  | VARCHAR(150)          | NULL                      | Reference của dữ liệu đã xác minh                                          |
| deduplication_key   | VARCHAR(200)          | NULL có điều kiện         | Khóa nghiệp vụ từ kênh/loại/reference đã xác minh                          |
| signature_valid     | BOOLEAN               | NN                        | Kết quả xác minh chữ ký                                                    |
| payload             | JSONB                 | NN                        | Payload được lưu theo chính sách bảo vệ dữ liệu                            |
| status              | webhook_status (ENUM) | NN, DEFAULT RECEIVED      | RECEIVED, PROCESSING, PROCESSED, FAILED, IGNORED                           |
| attempt_count       | INTEGER               | NN, DEFAULT 0, CHECK >= 0 | Số lần xử lý                                                               |
| next_retry_at       | TIMESTAMPTZ           | NULL                      | Lần xử lý lại                                                              |
| received_at         | TIMESTAMPTZ           | NN, DEFAULT NOW()         | Nhận webhook                                                               |
| processed_at        | TIMESTAMPTZ           | NULL                      | Xử lý thành công hoặc bỏ qua                                               |
| last_error          | TEXT                  | NULL                      | Lỗi đã lọc secret                                                          |

Partial UQ (provider, provider_channel_id, event_kind, deduplication_key) chỉ cho signature_valid TRUE. Webhook không hợp lệ không được chiếm khóa chống trùng của webhook hợp lệ.

Không bắt buộc provider_event_id nếu provider không có trường đó. Không dùng returnUrl/cancelUrl của trình duyệt làm bằng chứng thu/hoàn tiền. Trạng thái payout có thể được đối soát bằng API query khi không có webhook tương ứng.

### refund_requests — nghĩa vụ hoàn, số tiền và tài khoản đích

| Tên cột                       | Kiểu PostgreSQL           | Ràng buộc                                   | Ý nghĩa                                                                 |
| ----------------------------- | ------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| id                            | UUID                      | PK                                          | ID yêu cầu hoàn                                                         |
| payment_transaction_id        | UUID                      | NN, FK → payment_transactions.id            | Receipt tiền nguồn                                                      |
| cancellation_request_id       | UUID                      | NULL, FK → booking_cancellation_requests.id | Hủy đã được khách xác nhận                                              |
| reason_type                   | refund_reason_type (ENUM) | NN                                          | CUSTOMER_CANCELLATION, LATE_PAYMENT, OVERPAYMENT, MERCHANT_CANCELLATION |
| reason                        | TEXT                      | NN                                          | Lý do cụ thể                                                            |
| amount                        | NUMERIC(14,0)             | NN, CHECK > 0                               | Tiền hoàn của receipt này; không phải toàn bộ giá sân                   |
| currency                      | CHAR(3)                   | NN, DEFAULT VND                             | Đồng tiền                                                               |
| method                        | refund_method (ENUM)      | NN                                          | PAYOS_PAYOUT, MANUAL_BANK_TRANSFER, CASH                                |
| destination_bank_bin          | VARCHAR(10)               | NULL có điều kiện                           | Mã ngân hàng đích, lưu chuỗi                                            |
| destination_account_encrypted | BYTEA                     | NULL có điều kiện                           | Số tài khoản nhận hoàn được mã hóa                                      |
| destination_account_last4     | VARCHAR(4)                | NULL                                        | Dùng hiển thị che số tài khoản                                          |
| destination_account_name      | VARCHAR(150)              | NULL có điều kiện                           | Tên chủ tài khoản đã xác minh                                           |
| status                        | refund_status (ENUM)      | NN, DEFAULT REQUESTED                       | REQUESTED, APPROVED, PROCESSING, COMPLETED, REJECTED, CANCELLED         |
| requested_by_user_id          | UUID                      | NULL, FK → users.id                         | Người yêu cầu; guest/hệ thống có thể NULL                               |
| approved_by_user_id           | UUID                      | NULL, FK → users.id                         | Quản lý duyệt; auto duyệt phải có căn cứ hệ thống                       |
| approval_source               | approval_source (ENUM)    | NULL có điều kiện                           | MANAGER, SYSTEM_POLICY                                                  |
| approved_at                   | TIMESTAMPTZ               | NULL                                        | Duyệt                                                                   |
| rejection_reason              | TEXT                      | NULL                                        | Từ chối yêu cầu                                                         |
| completed_at                  | TIMESTAMPTZ               | NULL                                        | Tiền hoàn đã được xác minh thành công                                   |
| idempotency_key               | VARCHAR(150)              | NN, UQ                                      | Ví dụ căn cứ cancellation ID + receipt ID                               |
| created_at                    | TIMESTAMPTZ               | NN, DEFAULT NOW()                           | Tạo                                                                     |
| updated_at                    | TIMESTAMPTZ               | NN, DEFAULT NOW()                           | Cập nhật                                                                |

Index payment_transaction_id, (status, created_at).

- Hoàn qua bank/payout cần bank BIN, số tài khoản và tên người nhận đã được xác minh trước chi.
- Receipt nguồn phải VERIFIED. Tổng refund đã hoàn và đang được reserve không vượt số tiền receipt còn được phép hoàn; kiểm tra/reserve trong cùng transaction DB pickleball.
- Sau duyệt, số tiền và tài khoản đích là snapshot khóa lại. Thay đổi phải lấy phê duyệt mới; không sửa đích nhận trong lúc một attempt đang chi/chưa rõ kết quả.
- Một cancellation có thể sinh nhiều refund_requests nếu khách đã trả bằng nhiều receipt; tổng hoàn bằng khoản được duyệt, không phạt 10% riêng trên từng receipt.
- LATE_PAYMENT không tự chịu phí khách hủy nếu booking chưa được xác nhận; receipt muộn cần chính sách đối soát riêng.
- Một refund bằng 0 không tạo lệnh chi; phí vẫn được ghi trong cancellation request.
- Không lưu API key hoặc khóa mã hóa tài khoản ngân hàng trong database.

### refund_attempts — mỗi lần thực hiện chi/hoàn và đối soát

| Tên cột                    | Kiểu PostgreSQL              | Ràng buộc                   | Ý nghĩa                                                            |
| -------------------------- | ---------------------------- | --------------------------- | ------------------------------------------------------------------ |
| id                         | UUID                         | PK                          | ID lần thực hiện                                                   |
| refund_request_id          | UUID                         | NN, FK → refund_requests.id | Yêu cầu hoàn                                                       |
| attempt_number             | INTEGER                      | NN, CHECK > 0               | Số thứ tự lần thực hiện                                            |
| method                     | refund_method (ENUM)         | NN                          | PAYOS_PAYOUT, MANUAL_BANK_TRANSFER, CASH                           |
| provider                   | VARCHAR(30)                  | NULL                        | PAYOS khi chi API                                                  |
| reference_id               | VARCHAR(150)                 | NN, UQ                      | Mã lệnh chi nội bộ/referenceId                                     |
| idempotency_key            | VARCHAR(150)                 | NN, UQ                      | Khóa gửi lại cùng lệnh API                                         |
| provider_payout_id         | VARCHAR(150)                 | NULL                        | ID lệnh chi từ provider                                            |
| bank_transaction_reference | VARCHAR(150)                 | NULL                        | Chứng từ/mã giao dịch chi tiền                                     |
| source_account_key         | VARCHAR(100)                 | NN                          | Định danh ngân hàng/ví/quỹ tiền mặt nguồn để đối soát dòng tiền ra |
| amount                     | NUMERIC(14,0)                | NN, CHECK > 0               | Tiền chi, bằng số tiền refund đã duyệt                             |
| fee_amount                 | NUMERIC(14,0)                | NULL, CHECK >= 0            | Phí chi thực tế nếu có; không trừ ngầm tiền khách được báo hoàn    |
| status                     | refund_attempt_status (ENUM) | NN, DEFAULT CREATED         | CREATED, SUBMITTED, PROCESSING, SUCCEEDED, FAILED, UNKNOWN         |
| provider_approval_state    | VARCHAR(50)                  | NULL                        | Trạng thái phê duyệt gốc của provider                              |
| provider_transaction_state | VARCHAR(50)                  | NULL                        | Trạng thái giao dịch gốc của provider                              |
| executed_by_user_id        | UUID                         | NULL, FK → users.id         | Nhân viên thực hiện hoàn thủ công                                  |
| submitted_at               | TIMESTAMPTZ                  | NULL                        | Đã gửi lệnh chi                                                    |
| completed_at               | TIMESTAMPTZ                  | NULL                        | Kết quả cuối cùng đã xác minh                                      |
| evidence_reference         | TEXT                         | NULL                        | Tham chiếu chứng từ chi riêng tư                                   |
| failure_code               | VARCHAR(100)                 | NULL                        | Mã lỗi                                                             |
| failure_message            | TEXT                         | NULL                        | Lỗi đã lọc secret                                                  |
| created_at                 | TIMESTAMPTZ                  | NN, DEFAULT NOW()           | Tạo                                                                |
| updated_at                 | TIMESTAMPTZ                  | NN, DEFAULT NOW()           | Cập nhật                                                           |

UQ (refund_request_id, attempt_number); UQ (provider, provider_payout_id) khi có ID provider.

Timeout/không biết kết quả phải ở UNKNOWN và query đối soát hoặc retry cùng idempotency key. Không tạo attempt mới hoặc đổi sang chi tay khi chưa biết lệnh trước có chi thành công không. Chỉ có một attempt đang chi/chưa rõ kết quả cho một refund request. HTTP 200/PROCESSING không đủ để ghi SUCCEEDED; chỉ hoàn tất khi đã kiểm tra kết quả chi, số tiền và người nhận.

## Nhóm Notifications

### notification_deliveries — gửi email check-in có retry và lưu kết quả

| Tên cột             | Kiểu PostgreSQL              | Ràng buộc                 | Ý nghĩa                                                                  |
| ------------------- | ---------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| id                  | UUID                         | PK                        | ID lần gửi logic                                                         |
| booking_id          | UUID                         | NN, FK → bookings.id      | Đơn liên quan                                                            |
| recipient_email     | VARCHAR(254)                 | NN                        | Email snapshot nhận thông báo                                            |
| template_code       | notification_template (ENUM) | NN                        | BOOKING_CONFIRMED, CHECKIN_CODE, BOOKING_CANCELLED, REFUND_UPDATED       |
| payload_encrypted   | BYTEA                        | NULL                      | Nội dung/token gửi email nếu cần lưu để retry, mã hóa và có thời hạn lưu |
| deduplication_key   | VARCHAR(150)                 | NN, UQ                    | Chống tạo nhiều job cùng sự kiện/phiên bản token                         |
| status              | notification_status (ENUM)   | NN, DEFAULT QUEUED        | QUEUED, SENDING, SENT, FAILED                                            |
| attempt_count       | INTEGER                      | NN, DEFAULT 0, CHECK >= 0 | Số lần thử                                                               |
| next_retry_at       | TIMESTAMPTZ                  | NULL                      | Lịch retry                                                               |
| provider_message_id | VARCHAR(150)                 | NULL                      | ID nhà cung cấp email                                                    |
| last_error          | TEXT                         | NULL                      | Lỗi đã lọc secret/token                                                  |
| sent_at             | TIMESTAMPTZ                  | NULL                      | Provider đã chấp nhận gửi                                                |
| created_at          | TIMESTAMPTZ                  | NN, DEFAULT NOW()         | Tạo                                                                      |
| updated_at          | TIMESTAMPTZ                  | NN, DEFAULT NOW()         | Cập nhật                                                                 |

Index (status, next_retry_at). SENT không đồng nghĩa người nhận đã nhận vào inbox. Nếu cần tracking delivery/bounce sẽ thêm trạng thái sau khi chọn provider.

Email thất bại không làm booking mất hiệu lực: nhân viên có luồng tìm booking có quyền và gửi lại mã. Event/job chứa mã bí mật phải được bảo vệ; không ghi token gốc vào log hoặc outbox JSON công khai.

## Bảng kỹ thuật cho tác vụ nền

DB commit và Redis enqueue không atomic kể cả trong monolith. V1 tạo outbox_events; chưa viết dispatcher/worker.

### outbox_events — dùng chung trong monolith

| Tên cột        | Kiểu PostgreSQL | Ràng buộc                 | Ý nghĩa                                                 |
| -------------- | --------------- | ------------------------- | ------------------------------------------------------- |
| id             | UUID            | PK                        | event_id toàn cục                                       |
| aggregate_type | VARCHAR(50)     | NN                        | BOOKING, PAYMENT, REFUND…                               |
| aggregate_id   | UUID            | NN                        | Đối tượng sở hữu event                                  |
| event_type     | VARCHAR(100)    | NN                        | booking.confirmed, booking.cancelled, payment.received… |
| event_version  | SMALLINT        | NN, DEFAULT 1, CHECK > 0  | Phiên bản contract                                      |
| payload        | JSONB           | NN                        | Dữ liệu tối thiểu, không chứa secret/raw token          |
| occurred_at    | TIMESTAMPTZ     | NN, DEFAULT NOW()         | Thời điểm nghiệp vụ                                     |
| published_at   | TIMESTAMPTZ     | NULL                      | Queue đã xác nhận nhận job                              |
| attempt_count  | INTEGER         | NN, DEFAULT 0, CHECK >= 0 | Số lần publish                                          |
| next_retry_at  | TIMESTAMPTZ     | NULL                      | Retry                                                   |
| last_error     | TEXT            | NULL                      | Lỗi publish đã lọc                                      |

Ghi outbox cùng transaction dữ liệu nguồn. published_at nghĩa queue nhận job, không phải nghiệp vụ/email hoàn tất. Không lưu raw token/secret. inbox_events chỉ xem xét khi thực sự dùng broker, không có trong v1.

## Trạng thái và quan hệ cần ghi trong sheet

| Luồng           | Trạng thái chính                                                                       |
| --------------- | -------------------------------------------------------------------------------------- |
| Booking         | HOLDING → CONFIRMED → CHECKED_IN → COMPLETED                                           |
| Giữ chỗ hết hạn | HOLDING → EXPIRED; occupancy RELEASED                                                  |
| Khách hủy       | CONFIRMED → CANCELLED sau đồng ý quote; occupancy RELEASED                             |
| Không tới       | CONFIRMED → NO_SHOW theo chính sách chưa chốt; không tự suy ra phí/hoàn                |
| Refund          | REQUESTED → APPROVED → PROCESSING → COMPLETED; attempt lỗi/UNKNOWN được đối soát riêng |

booking_cancellation_requests không thay thế refund_requests. Booking CANCELLED không đồng nghĩa tiền đã hoàn, cũng không chờ refund thành công mới hiển thị sân trống.

Một booking nhiều payment_requests; một payment_request nhiều receipt; một receipt có nhiều refund_requests nhưng không vượt tiền có thể hoàn; mỗi refund_request nhiều attempt lịch sử nhưng không chi song song.

Giá và thông tin liên hệ trên booking là snapshot có chủ đích. Không tự sửa lịch sử khi user đổi profile hoặc quản lý đổi bảng giá.

## Những thay đổi so với sheet gốc

- users: chuyển full_name sang user_profiles; role sang user_roles; is_active sang status.
- branches: chuyển open_time/close_time sang branch_business_hours.
- bookings: thay booking_date/start_time/end_time bằng starts_at/ends_at; deposit_amount bằng required_prepayment_amount và prepayment_percent; thêm email bắt buộc; chuyển payment_code sang payment_requests; chuyển checkin_code sang booking_access_tokens.
- checkin_logs: đổi thành booking_checkins, giữ đúng nghĩa một check-in thành công.
- payments: tách thành payment_requests và payment_transactions; không bắt transaction_reference có trước khi có tiền.
- court_blocks: không thêm bảng riêng, dùng court_occupancies chung cho booking/block để bảo vệ lịch.
- V1 dùng FK vật lý giữa các nhóm trong DB chung. Khi scale chi nhánh, thêm branch_memberships thay vì thêm trường branch_id cố định vào profile.
- Chưa thêm bảng products/orders/inventory/shipping. V1 reference_type chỉ BOOKING, reference_id có FK bookings. Commerce cần đích tham chiếu mới, không chỉ thêm enum SALES_ORDER; không dùng bookings làm sales_orders.

## Các điểm còn mở

1. Mốc hủy: trước starts_at hay trước check-in, kể cả đã quá starts_at.
2. Khoảng thời gian check-in sớm/muộn; có bắt buộc trả hết phần còn lại trước check-in không (đề xuất có).
3. Sân chủ động hủy: đề xuất hoàn toàn bộ tiền khách đã trả và không áp phạt khách 10%, nhưng chưa phải quyết định người dùng.
4. No-show, đổi lịch và booking đã sử dụng: chưa xác định; không gộp vào chính sách khách hủy trước check-in.
5. Thời hạn hoàn tiền cam kết với khách, phí chi do ai chịu, nguồn vốn Kênh Chi và quyền merchant: chưa xác minh cho tài khoản cụ thể.
6. Làm tròn giá cho phút lẻ và khoản trả trước/phạt: đề xuất làm tròn đến 1 VND, lưu giá đã chốt; cần công bố nhất quán.

Đã tạo schema/migration v1; chưa apply DB, generate client, build/test hoặc gọi ngân hàng. Google Sheet không sửa trực tiếp.

## Phạm vi migration v1

V1 có21 bảng nghiệp vụ và outbox_events,30 enum,38 FK,78 CHECK. Khóa ghép bảo đảm sân/chi nhánh booking, sân occupancy và QR booking check-in đồng nhất. Exclusion bảo vệ khoảng ACTIVE; vệ sinh tối thiểu15phút không tính phí.

Booking MVP đã có transaction giữ chỗ/giá/history/occupancy, expiry và hủy HOLDING. Quy tắc đã chốt cho phase này xem [BOOKING-MVP.md](BOOKING-MVP.md); các điểm OPEN ở trên vẫn áp dụng cho giai đoạn có thanh toán. Tổng receipt/refund qua nhiều row, quyền nhân viên và workflow payment/check-in còn chưa triển khai.

Expression unique lower(email/username), partial unique một cancellation APPLIED, dedup webhook hợp lệ, một refund attempt đang chạy/UNKNOWN/SUCCEEDED, cùng chứng từ chi không ghi hai lần đều nằm trong SQL. Migration tùy chỉnh không được bỏ khi tạo v2.

Đọc [OPERATIONS.md](OPERATIONS.md) để áp dụng migration. Schema sinh client; SQL migration giữ lịch sử DDL. Chưa có Prisma CLI local nên SQL được viết từ cùng định nghĩa model, chưa kiểm chứng trên DB.
