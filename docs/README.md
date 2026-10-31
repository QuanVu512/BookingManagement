# Tài liệu hệ thống

Bắt đầu tại [README](../README.md). Tài liệu phân theo mục đích đọc theo [Diátaxis](https://diataxis.fr/start-here/): học qua quy trình đầu tiên, thực hiện công việc, tra cứu và hiểu kiến trúc. Quy ước biên tập tại [DOCUMENTATION-STANDARDS.md](DOCUMENTATION-STANDARDS.md).

## Khởi động lần đầu

| Tài liệu                              | Kết quả                                                |
| ------------------------------------- | ------------------------------------------------------ |
| [Getting started](GETTING-STARTED.md) | Chạy web/API và hạ tầng local với DB development riêng |
| [Configuration](CONFIGURATION.md)     | Hiểu env, cổng và thứ tự nạp                           |
| [Contributing](../CONTRIBUTING.md)    | Chuẩn bị thay đổi và chọn kiểm tra phù hợp             |

## Hướng dẫn công việc

| Tài liệu                                    | Phạm vi                                                |
| ------------------------------------------- | ------------------------------------------------------ |
| [Operations](OPERATIONS.md)                 | Migration, seed, SMTP local, rollout và chẩn đoán      |
| [Pipelines](PIPELINES.md)                   | Lint, unit, integration, build và side effect của test |
| [CI troubleshooting](CI-TROUBLESHOOTING.md) | Điều tra CI và môi trường test                         |
| [Booking MVP](BOOKING-MVP.md)               | Contract giữ chỗ, giá, expiry và seed                  |

## Tham chiếu

| Tài liệu                                              | Phạm vi                                          |
| ----------------------------------------------------- | ------------------------------------------------ |
| [API](API.md)                                         | Nhóm endpoint, session, CSRF, guest token và lỗi |
| [Database](DATABASE.md)                               | Model, quan hệ và invariant SQL                  |
| [Data dictionary](DATABASE-DESIGN.md)                 | Thiết kế bảng gốc; đọc cùng schema/migration mới |
| [Tech stack](TECH-STACK.md)                           | Version khai báo, lockfile và runtime            |
| [Security](SECURITY.md)                               | Session, account, quyền và giới hạn bảo mật      |
| [Guest recovery](GUEST-BOOKING-RECOVERY-CONTRACTS.md) | Hợp đồng khôi phục checkout khách vãng lai       |
| [Frontend UI](FRONTEND-UI.md)                         | Route, dữ liệu UI và dependency chưa hoàn thiện  |

## Giải thích hệ thống

| Tài liệu                                           | Phạm vi                                             |
| -------------------------------------------------- | --------------------------------------------------- |
| [Project](PROJECT.md)                              | Phạm vi hiện tại, giới hạn và quyết định còn mở     |
| [Architecture](ARCHITECTURE.md)                    | Topology, trách nhiệm và ranh giới transaction      |
| [Backend architecture](BACKEND-ARCHITECTURE.md)    | Use case, port, adapter và module                   |
| [Frontend architecture](FRONTEND-ARCHITECTURE.md)  | Route, state, feature và HTTP integration           |
| [Workflows](WORKFLOWS.md)                          | Booking, thanh toán, hủy, check-in và state machine |
| [Codebase map](CODEBASE-MAP.md)                    | Định vị source, test và cấu hình                    |
| [Development streams](ROADMAP-WORKTREE-STREAMS.md) | Dependency và ownership của các vùng phát triển     |

## Chính sách và điều kiện phát hành

- [Legal và privacy](LEGAL-AND-PRIVACY.md): nội dung chính sách và tích hợp UI.
- [Privacy data inventory](PRIVACY-DATA-INVENTORY.md): dữ liệu, mục đích và retention cần duyệt.
- [Release requirements](RELEASE-REQUIREMENTS.md): điều kiện và evidence trước vận hành thương mại.

Các trang pháp lý/release không phải chứng nhận tuân thủ hoặc quyền tự triển khai. Quyết định chưa duyệt giữ OPEN. Có source, schema hoặc test config chưa chứng minh runtime, DB đích hay provider hoạt động.

## Hiện hành và lịch sử

Tài liệu cốt lõi phản ánh source, không thay log kiểm chứng của revision. Nội dung trong `completion/` là snapshot audit/decision/implementation theo thời điểm ghi trong file; không dùng nhãn PASS, số test hoặc blocker cũ làm trạng thái hiện tại. Tài liệu pilot, workflow AI và báo cáo cục bộ không phải hướng dẫn khởi động sản phẩm.

Chỉ link file được publish cùng repo. Học liệu cá nhân và cấu hình/điều phối AI local không thuộc bộ tài liệu public; không đặt secrets, PII hoặc evidence hợp đồng riêng tư tại đây. Schema/migration, policy JSON, tests và CI là source phải version cùng tính năng.
