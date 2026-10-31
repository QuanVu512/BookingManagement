# Đóng góp cho Pickleball Booking

Hướng dẫn dành cho người sửa source, test hoặc tài liệu. Repository hiện khai báo `UNLICENSED` trong [package.json](package.json); quyền truy cập không thay thế quyền sử dụng mã nguồn.

## Chuẩn bị

1. Đọc [README](README.md), [phạm vi](docs/PROJECT.md) và contract miền cần sửa.
2. Chạy môi trường theo [Getting started](docs/GETTING-STARTED.md).
3. Chọn module bằng [bản đồ codebase](docs/CODEBASE-MAP.md).
4. Giữ nguyên thay đổi của người khác; một writer mỗi file khi làm song song.

## Quy ước kỹ thuật

- Backend ưu tiên controller/presenter, application use case, port và adapter theo module; không gom nghiệp vụ độc lập vào service tổng.
- Frontend tổ chức feature theo component, hook, API và model. Server quyết định giá, quyền, thời gian và trạng thái tiền.
- Giữ transaction, exclusion constraint, idempotency và snapshot tiền khi sửa booking/payment.
- Không sửa migration đã apply; thêm migration mới, bảo toàn CHECK, partial index và exclusion SQL.
- Không commit env local, secrets, dữ liệu khách hàng, generated client, build output hoặc báo cáo tạm.

## Kiểm tra trước pull request

Đọc [PIPELINES.md](docs/PIPELINES.md) và scripts cùng pre/post-hook trong [package.json](package.json). Chọn kiểm tra theo phạm vi; không dùng DB ứng dụng làm DB test.

| Thay đổi           | Kiểm tra liên quan                                                                 |
| ------------------ | ---------------------------------------------------------------------------------- |
| Chỉ tài liệu       | Link/path, command với manifest, contract với source, Markdown và dữ liệu nhạy cảm |
| Auth               | Unit/contract; security/storage riêng nếu đổi persistence hoặc session             |
| Booking/giá        | Pricing unit, integration DB/Redis test, biên thời gian và cạnh tranh slot         |
| Frontend tương tác | Test liên quan; browser thật cho flow, lỗi, loading, quyền và viewport             |
| Schema/SQL         | Diff schema + SQL, upgrade trên DB test riêng, constraint và dữ liệu lịch sử       |

`npm test` dùng unit/JSDOM, không thay browser E2E. `test:e2e` restart container test và migrate qua pre-hook. `npm run build` generate client rồi build API, không migrate. Không tự deploy, seed, migrate hoặc giao dịch thật ngoài quyền/môi trường được giao.

## Pull request và commit

Nêu vấn đề, hành vi sau thay đổi, phạm vi, kiểm chứng và giới hạn. Ghi PASS/FAIL/NOT_RUN/BLOCKED với command/bước tái hiện; không dùng CI result cũ làm kết quả mới. Đổi API/chính sách cần cập nhật tài liệu và consumer liên quan.

Dùng commit tập trung, ví dụ `docs: refresh setup and architecture references`. Không gộp thay đổi không liên quan hoặc ghi credential/PII trong message, issue, ảnh.

## Tài liệu và báo lỗi

Áp dụng [quy ước tài liệu](docs/DOCUMENTATION-STANDARDS.md): mục đích, nguồn chuẩn và giới hạn rõ; không icon/emoji hoặc ảnh giả giao diện. Screenshot chỉ từ ứng dụng thật, không có thông tin riêng tư.

Báo lỗi với revision, môi trường, bước tái hiện, expected/observed và log đã lọc. Báo lỗ hổng qua kênh riêng của chủ repository; không công bố token, dữ liệu khách hàng hoặc chi tiết khai thác nhạy cảm. Source hiện chưa công bố security mailbox hoặc SLA hỗ trợ.
