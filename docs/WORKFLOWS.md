# Quy trình nghiệp vụ và state machine

Booking MVP đã triển khai HOLDING 5 phút, lazy expiry và hủy giữ chỗ chưa thanh toán theo owner, trước giờ bắt đầu và chưa check-in. Giá làm tròn từng dòng đến 1 VND rồi cộng tổng. Chi tiết tại [BOOKING-MVP.md](BOOKING-MVP.md). Payment/refund/check-in/guest và CONFIRMED vẫn là thiết kế; sơ đồ dưới đây không chứng minh các luồng đó đã được thực thi.

## Đặt sân và giữ lịch

Thiết kế hiện ghi nhận:

1. Booking lưu sân, thời gian bắt đầu/kết thúc, giá và thông tin khách dạng snapshot.
2. User có tài khoản được chọn trả trước 30% hoặc 100%; guest không tạo user giả, cần tên/email/điện thoại và trả trước 100%.
3. Booking mới ở `HOLDING` với hạn hoàn tất khoản trả trước 5 phút. Khi đạt điều kiện thanh toán, luồng dự kiến xác nhận booking.
4. `CourtOccupancy` đại diện khoảng chiếm lịch; snapshot `cleanupMinutes` mặc định 15 phút được cộng vào cuối giờ chơi. SQL exclusion constraint bảo vệ overlap của occupancy `ACTIVE`.

```mermaid
stateDiagram-v2
  [*] --> HOLDING
  HOLDING --> CONFIRMED: đạt khoản trả trước
  HOLDING --> EXPIRED: hết hạn
  CONFIRMED --> CHECKED_IN: check-in hợp lệ
  CHECKED_IN --> COMPLETED: kết thúc
  CONFIRMED --> CANCELLED: quote được chấp nhận và áp dụng
  CONFIRMED --> NO_SHOW: chính sách còn mở
```

Khi hủy hoặc hết hạn, thiết kế yêu cầu occupancy được giải phóng; khoản đến muộn phải vào đối soát, không tự khôi phục booking đã `EXPIRED`/`CANCELLED`.

## Hủy và hoàn tiền

Thiết kế hiện chọn phí hủy khách bằng 10% tổng giá booking, hoàn phần tiền thực nhận còn lại; khách phải thấy quote và đồng ý trước khi áp dụng. `BookingCancellationRequest` theo dõi quote/consent, còn `RefundRequest` và `RefundAttempt` theo dõi nghĩa vụ và từng lần hoàn. Booking `CANCELLED` không đồng nghĩa tiền đã hoàn.

MVP chỉ hủy HOLDING trước giờ bắt đầu, chưa check-in và không thu phí vì chưa thu tiền. Với booking đã thanh toán/CONFIRMED, mốc hủy, sân chủ động hủy, no-show, đổi lịch, check-in sớm/muộn và rounding/thời hạn/phí hoàn vẫn **OPEN**. Không áp contract giữ chỗ này cho refund.

## Thanh toán và check-in

Schema hỗ trợ nhiều `PaymentRequest` cho booking, receipt `PaymentTransaction`, sự kiện webhook và các refund attempt có idempotency. Luồng provider/webhook/đối soát chưa được implement. Check-in có thể qua QR hoặc thao tác thủ công trong enum; module chưa có endpoint/workflow. Điều kiện trả đủ trước check-in được ghi là đề xuất cần chốt trong [DATABASE-DESIGN.md](DATABASE-DESIGN.md), không phải contract đã hoàn tất.

## Ranh giới an toàn khi implement

- Server xác định giá, thời gian, trạng thái, quyền và kết quả thanh toán.
- Transaction phải bảo vệ invariant DB; Redis chỉ là lớp bổ sung.
- Webhook phải xác minh signature/amount, chống duplicate và xử lý late payment; refund cần idempotency và đối soát trạng thái UNKNOWN.
- Token check-in/manage booking phải gắn đúng booking, có mục đích/expiry và không được dùng lại sau consume nếu contract yêu cầu một lần.
- Ghi lịch sử/outbox cùng transaction nguồn khi nghiệp vụ được triển khai.

Schema và constraint: [DATABASE.md](DATABASE.md). Quyền và token: [SECURITY.md](SECURITY.md). Điểm còn mở có danh sách chuẩn tại [PROJECT.md](PROJECT.md) và [DATABASE-DESIGN.md](DATABASE-DESIGN.md).
