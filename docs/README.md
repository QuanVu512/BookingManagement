# Tài liệu hệ thống

`docs/` chứa tài liệu ổn định, đã rà soát và hữu ích cho người duy trì repository. Chọn tài liệu theo miền bên dưới; đối chiếu source hiện hành khi tài liệu cũ chưa phản ánh hết thay đổi.

## Kiến trúc và dữ liệu

- [Backend architecture](BACKEND-ARCHITECTURE.md)
- [Frontend architecture](FRONTEND-ARCHITECTURE.md)
- [Database summary](DATABASE.md)
- [Security, auth và permissions](SECURITY.md)

## Nghiệp vụ và vận hành

- [Workflows và state machines](WORKFLOWS.md) — thiết kế và các quyết định còn mở.
- [Tiến độ & Phân chia Worktree](ROADMAP-WORKTREE-STREAMS.md) — tổng kết module hiện có, module còn thiếu và ranh giới chia Git worktree.
- [Pipelines](PIPELINES.md) — build, test, lint, CI và migration.
- [Legal và privacy](LEGAL-AND-PRIVACY.md) — routes, cookie consent, policy versioning và chính sách booking.
- [Danh mục dữ liệu cá nhân](PRIVACY-DATA-INVENTORY.md) — mục đích, lưu trữ, bên nhận và giới hạn retention.
- [Điều kiện phát hành](RELEASE-REQUIREMENTS.md) — quyết định còn mở và evidence trước vận hành thương mại.

## Tài liệu tham chiếu

- [Bối cảnh và điểm còn mở](PROJECT.md)
- [Kiến trúc và ownership chi tiết](ARCHITECTURE.md)
- [Data dictionary](DATABASE-DESIGN.md)
- [Tech stack và version policy](TECH-STACK.md)
- [Commands vận hành](OPERATIONS.md)

Tài liệu học cá nhân, giáo trình và bản copy Sheet nằm ở guide/ và được Git ignore. Schema/migration thật thuộc backend/prisma và cần version control; generated client có quy tắc ignore riêng.

## Quy ước đóng góp tài liệu

Public documentation nằm trong `docs/`: hướng dẫn developer, kiến trúc, API, bảo mật và vận hành có giá trị lâu dài. Chỉ liên kết tới file được publish cùng repository; không đưa thông tin cá nhân, secrets hoặc bằng chứng hợp đồng riêng tư vào docs.

Agent mặc định lưu plan dùng tạm, handoff, scratchpad, corrective audit và progress report tại `.temp/ai-reports/` (compliance dùng `.temp/ai-reports/compliance/`). Các thư mục này được Git ignore. `coordination/` tiếp tục là dữ liệu điều phối local. Không tạo lại bộ báo cáo trong `docs/compliance/` hoặc `compliance/`.

Không tạo báo cáo public chỉ để tổng kết một implementation thành công. Khi hoàn tất task, chỉ cập nhật tài liệu bền vững liên quan nếu hành vi hoặc kiến trúc hệ thống thay đổi đáng kể. Giữ policy JSON, manifest, schema, migration, tests và CI cùng source dưới version control; chúng không phải báo cáo AI.

Docs mô tả hệ thống; trạng thái DB thực tế cần đọc migration history của đúng môi trường.
