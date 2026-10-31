# Phạm vi sản phẩm

Pickleball Booking hỗ trợ tìm sân, xem lịch, giữ chỗ, đặt cọc và vận hành lượt chơi. Đây là ứng dụng đang phát triển với một Next.js frontend, một NestJS backend và một PostgreSQL database; không có database-per-service hoặc API gateway riêng.

## Phạm vi hiện có trong source

| Miền           | Implementation                                                       | Giới hạn                                                                       |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Auth           | Login/register, email OTP, reset, CSRF, JWT revocation               | Chưa có refresh rotation, MFA hoặc OAuth                                       |
| Users          | Đọc/cập nhật hồ sơ qua use case                                      | Không suy ra email/phone change đã có reverification                           |
| Courts         | Sân ACTIVE, chi tiết, giá theo phút, availability/occupancies        | Chưa đầy đủ quản trị sân, bảng giá và block bảo trì                            |
| Bookings       | Hold 5 phút, owner list/detail, expiry/cancel, idempotency           | Server quyết định giá, thời gian và trạng thái                                 |
| Guest          | Email OTP, proof, checkout intent/recovery, manage token             | Không tạo user giả; không tra cứu chỉ bằng mã/số điện thoại                    |
| Payments       | payOS adapter, request/inbox/receipt, đối soát, refund orchestration | Chưa chứng minh merchant/channel hoặc payout thực tế                           |
| Check-in       | Mint token, staff verify/manual/complete                             | Cần đủ tiền verified và điều kiện thời gian phía server                        |
| Notifications  | Auth SMTP, payment outbox/jobs                                       | Chưa có delivery sink hoàn chỉnh cho email booking; Socket.IO chưa nối runtime |
| Hỗ trợ/pháp lý | Knowledge assistant, policy, privacy requests, support cases         | Không đồng nghĩa đã có AI provider ngoài hoặc hoàn tất xử lý yêu cầu pháp lý   |

Bảng phản ánh source; không gán PASS cho runtime chưa chạy. Những thay đổi chưa commit trong working tree không được coi là tính năng đã phát hành.

## Quy tắc nghiệp vụ hiện hành

- Khoảng chơi chính xác theo phút, có timezone; không áp lưới 15 phút cho nghiệp vụ.
- Hold tồn tại 5 phút theo giờ server. Snapshot giá/occupancy/history ghi trong transaction.
- Booking mới của member và guest đặt cọc 30%; snapshot 100% lịch sử vẫn được đọc, không backfill tiền.
- Cleanup tối thiểu 15 phút, cộng vào occupancy nhưng không tính phí chơi.
- Hủy booking đã thanh toán phải quote và consent. Trước cửa sổ hủy muộn, phí thông thường 10% tổng giá; trong 12 giờ trước startsAt đến trước endsAt chỉ staff xử lý, giữ khoản cọc 30%, không cộng thêm phí 10%.
- No-show giữ deposit 30%; phần verified vượt deposit tạo nghĩa vụ hoàn. Check-in cần đủ số dư đã xác minh.
- Refund REQUESTED/APPROVED và refund thực trả thành công là các trạng thái khác nhau. Tiền đến muộn không khôi phục booking terminal.

Chi tiết và điều kiện tại [WORKFLOWS.md](WORKFLOWS.md), [BOOKING-MVP.md](BOOKING-MVP.md), schema và use case liên quan. Các mô tả thiết kế v1 trong data dictionary cần đọc cùng migration/policy mới.

Tại đúng T−12h, code hiện xếp hủy muộn nhưng policy công bố trong [Legal và privacy](LEGAL-AND-PRIVACY.md#chính-sách-booking-đã-duyệt) ghi thuộc hủy thường. Đây là điểm lệch cần xử lý trước release, không phải quyết định policy mới.

## Phần chưa hoàn thiện

Dashboard còn nhãn DEMO; chưa có đầy đủ admin court/price/block APIs và portal. Dịch vụ bổ sung còn thiếu API, coupon chưa hỗ trợ. Booking dùng HTTP polling, realtime chưa nối vào flow. Worker outbox có bounded retry/quarantine khi chưa có sink; không coi publish job là thư đã gửi.

## Quyết định và nghiệm thu còn mở

Merchant/channel và payout mode, topology production/TLS/proxy, SMTP thực, retention/audit, backup/restore, RPO/RTO/SLO và phân quyền vận hành chi tiết cần owner xác nhận. Dịch vụ bổ sung, thay đổi định danh và chính sách ngoại lệ cần scope riêng. Không tự suy quyết định từ mockup, enum hoặc dependency.

Xem [điều kiện phát hành](RELEASE-REQUIREMENTS.md). Có CI/migration/source không chứng minh DB ứng dụng, provider hoặc production đã sẵn sàng.
