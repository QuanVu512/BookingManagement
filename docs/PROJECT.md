# Bối cảnh Booking Project

Next frontend và Nest modular monolith trong frontend/backend. Một DB PostgreSQL do DATABASE_URL chọn, schema public; local mặc định pickleball, Neon theo URL. Manifest/lockfile root chung; không có apps/libs/database-per-service runtime.

Đặt khoảng linh hoạt, giữ5phút, khách có tài khoản chọn30%/100%, guest100% có tên/email/điện thoại, buffer vệ sinh tối thiểu15phút không tính phí. Hủy phạt10% tổng giá, phải có quote/consent.

DB models/migration v1 đã tạo; trạng thái apply cần xem ở DB đích; workflows booking, payment, webhook, refund, email, check-in chưa implement. Trạng thái auth và API hiện có theo [BACKEND-ARCHITECTURE.md](BACKEND-ARCHITECTURE.md) và [SECURITY.md](SECURITY.md). Redis/BullMQ/Socket.IO chỉ plumbing.

OPEN: mốc hủy trước start hay trước check-in; check-in sớm/muộn và yêu cầu trả đủ; sân chủ động hủy/no-show/đổi lịch; rounding; merchant payout/phí/deadline hoàn; email provider. Không tự biến điểm mở thành hành vi.

Đọc ARCHITECTURE.md, DATABASE-DESIGN.md, TECH-STACK.md và OPERATIONS.md. Học liệu nằm trong guide/. Roadmap không tự cấp quyền implementation.
