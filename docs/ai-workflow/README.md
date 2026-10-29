# Skill delivery độc lập model

Bốn skill chuẩn nằm tại `C:/Users/Admin/.agents/skills/`: `architecture-planner`, `evidence-review-gate`, `implementation-executor`, `delivery-orchestrator`. Skill dự án là `.agents/skills/bookingmanagement-delivery`. Mỗi skill có SKILL.md theo [Agent Skills](https://agentskills.io/specification). Đây là hướng dẫn, không phải sandbox hoặc engine cưỡng chế. Quy tắc dự án và quyền user vẫn áp dụng.

## Sử dụng

Chọn model bằng giao diện runtime hiện tại; không đổi file cấu hình khi đổi role. Trong Codex yêu cầu `Dùng $architecture-planner cho task ...`, `$evidence-review-gate` hoặc `$implementation-executor`; có thể gọi `$delivery-orchestrator` khi cần phối hợp. Trong Gemini CLI hoặc OpenCode, yêu cầu bằng tên skill và role; nếu không thấy, yêu cầu đọc trực tiếp SKILL.md theo đường dẫn trên. Skill workspace chỉ áp dụng trong dự án này. Không có role gắn với provider. Kích hoạt ngầm do runtime quyết định, không tự cho phép triển khai hoặc handoff.

Ví dụ: Codex Planner: `Dùng $architecture-planner lập kế hoạch ...`; Codex Reviewer: `Dùng $evidence-review-gate, CODE_REVIEW, kiểm tra diff ...`; Gemini Implementer: `Dùng implementation-executor thực hiện yêu cầu đã duyệt ...`; phiên có model DeepSeek Reviewer: `Dùng evidence-review-gate, CODE_REVIEW ...`. Mọi model có thể lần lượt làm các role. Dùng phiên review riêng nếu có thể; tự review phải khai báo giới hạn.

Gemini có lệnh `gemini skills list --all`; mở phiên mới sau khi cài. Codex hỗ trợ `$skill-name`; `codex --sandbox read-only` chọn sandbox phiên review, tùy khả năng thực tế của hệ điều hành. Handoff file không cần lệnh riêng. OpenCode 2.1.4 hiện cài có giao diện khác tài liệu OpenCode công khai; chưa xác nhận discovery, permissions hoặc cú pháp riêng cho phiên bản này, đọc SKILL.md thủ công nếu cần. Không thay cấu hình hay credential.

## Handoff và hội tụ

Sao chép mẫu tại `~/.agents/skills/delivery-orchestrator/assets/handoff.md` vào vị trí artifact được project cho phép. Mỗi phiên đọc yêu cầu, tiêu chí, snapshot code và findings thực tế. Ghi commit cùng snapshot gồm staged, unstaged và file untracked trong phạm vi; nếu không xác định được snapshot, review freshness là chưa xác minh. Code đổi sau review làm approval cũ không tự bao phủ. Không truyền secret.

Một full review, một đợt sửa có mục tiêu, một focused re-review. Giữ ID findings; blocker chưa xử lý không thể PASS. Không tự mở lại planning. Hết ngân sách mà còn blocker thì dừng và chuyển owner quyết định. `DELIVERY_READY` không chứng minh CI đã chạy.

Cập nhật trực tiếp bản canonical, kiểm tra frontmatter và discovery trong phiên mới. Để gỡ an toàn, chỉ xóa từng thư mục trong bốn thư mục mới sau khi xác nhận không còn dùng; không xóa thư mục cha hoặc skill khác. Xóa skill workspace riêng nếu không còn cần. Các file global không tự được Git của dự án quản lý; sao lưu trước khi sửa/xóa.
