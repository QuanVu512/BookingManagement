# Bối cảnh Booking Project

Next frontend và Nest modular monolith trong frontend/backend. Một DB PostgreSQL do DATABASE_URL chọn, schema public; local mặc định pickleball, Neon theo URL. Manifest/lockfile root chung; không có apps/libs/database-per-service runtime.

Đặt khoảng linh hoạt, giữ5phút, khách có tài khoản chọn30%/100%, guest100% có tên/email/điện thoại, buffer vệ sinh tối thiểu15phút không tính phí. Hủy phạt10% tổng giá, phải có quote/consent.

DB models/migrations đã tạo; trạng thái apply cần xem ở DB đích. [Booking MVP](BOOKING-MVP.md) đã có giữ chỗ HOLDING 5 phút, giá snapshot theo phút, expiry và hủy giữ chỗ trước starts_at/chưa check-in. Payment, webhook, refund, guest và check-in chưa implement. Trạng thái auth/email recovery theo [SECURITY.md](SECURITY.md). Core booking dùng PostgreSQL transaction/exclusion constraint; BullMQ chỉ chạy worker dọn hold hết hạn, không dùng Redis lock.

OPEN cho giai đoạn có thanh toán: mốc hủy CONFIRMED trước start hay trước check-in; check-in sớm/muộn và yêu cầu trả đủ; sân chủ động hủy/no-show/đổi lịch; rounding prepayment/phạt/refund; merchant payout/phí/deadline hoàn; email provider. MVP giữ chỗ đã chọn HALF_UP từng dòng VND rồi cộng tổng và chỉ hủy HOLDING trước start/chưa check-in theo plan đã được giao.

Đọc ARCHITECTURE.md, DATABASE-DESIGN.md, TECH-STACK.md và OPERATIONS.md. Học liệu nằm trong guide/. Roadmap không tự cấp quyền implementation.
