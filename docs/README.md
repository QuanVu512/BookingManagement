# Tài liệu hệ thống

`docs/` chứa specification và runbook để version cùng repository. Bắt đầu bằng bản đồ và quy tắc đọc để chỉ mở tài liệu của miền liên quan.

## Kiến trúc và dữ liệu

- [Backend architecture](BACKEND-ARCHITECTURE.md)
- [Frontend architecture](FRONTEND-ARCHITECTURE.md)
- [Database summary](DATABASE.md)
- [Security, auth và permissions](SECURITY.md)

## Nghiệp vụ và vận hành

- [Workflows và state machines](WORKFLOWS.md) — thiết kế và các quyết định còn mở.
- [Tiến độ & Phân chia Worktree](ROADMAP-WORKTREE-STREAMS.md) — tổng kết module hiện có, module còn thiếu và ranh giới chia Git worktree.
- [Pipelines](PIPELINES.md) — build, test, lint, CI và migration.

## Tài liệu tham chiếu

- [Bối cảnh và điểm còn mở](PROJECT.md)
- [Kiến trúc và ownership chi tiết](ARCHITECTURE.md)
- [Data dictionary](DATABASE-DESIGN.md)
- [Tech stack và version policy](TECH-STACK.md)
- [Commands vận hành](OPERATIONS.md)

Tài liệu học cá nhân, giáo trình và bản copy Sheet nằm ở guide/ và được Git ignore. Schema/migration thật thuộc backend/prisma và cần version control; generated client có quy tắc ignore riêng.

Các báo cáo điều phối/kiểm tra AI nằm trong coordination/. Docs mô tả hệ thống; trạng thái DB thực tế cần đọc migration history của đúng môi trường.
