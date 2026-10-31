# Quy ước tài liệu

Tài liệu public được version cùng source, dành cho developer, maintainer và người vận hành. README trả lời dự án làm gì, bắt đầu thế nào và tìm trợ giúp ở đâu theo [hướng dẫn GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes).

## Tổ chức

Áp dụng cách phân chia của [Diátaxis](https://diataxis.fr/start-here/); đây là framework viết tài liệu, không phải chứng nhận ISO.

| Mục đích                   | Nội dung                                                                          |
| -------------------------- | --------------------------------------------------------------------------------- |
| Học qua quy trình đầu tiên | [Getting started](GETTING-STARTED.md)                                             |
| Hoàn thành tác vụ          | [Operations](OPERATIONS.md), [CI troubleshooting](CI-TROUBLESHOOTING.md)          |
| Tra cứu contract/tham số   | [API](API.md), [Configuration](CONFIGURATION.md), [Database](DATABASE.md)         |
| Hiểu kiến trúc/quyết định  | [Architecture](ARCHITECTURE.md), [Workflows](WORKFLOWS.md), [Project](PROJECT.md) |

Không lặp toàn bộ setup trong trang kiến trúc. Hướng dẫn dùng bước, điều kiện và kết quả mong đợi; tham chiếu dùng bảng route/field. Link nguồn chuẩn thay vì tạo bản sao khó duy trì.

## Trình bày

- Tiếng Việt nhất quán; tên route, model, status và command đúng source.
- Một H1 mỗi trang, heading tăng cấp hợp lý, dòng trống quanh list/table/fence.
- Code fence có ngôn ngữ; ghi cwd, môi trường và side effect của command.
- Không icon/emoji hoặc badge trang trí; dùng bảng/Mermaid khi giúp hiểu nội dung.
- Link tương đối chỉ tới file được version; không link tài liệu local bị ignore.
- Screenshot từ UI thật, có route/môi trường; không cookie, token, PII hoặc email riêng. Ảnh demo không chứng minh nghiệp vụ thành công.

## Độ chính xác

| Nội dung            | Nguồn đối chiếu                                                      |
| ------------------- | -------------------------------------------------------------------- |
| Command/hook        | [package.json](../package.json)                                      |
| CI                  | [Workflow](../.github/workflows/ci.yml)                              |
| Version             | [.nvmrc](../.nvmrc), manifest và lockfile; không ghi là bản mới nhất |
| Model/constraint    | [Schema](../backend/prisma/schema.prisma) và migration               |
| API/quyền           | Controller, DTO, guard, use case; Swagger khi API đang chạy          |
| Runtime/DB/provider | Evidence đúng revision và môi trường                                 |

Phân biệt yêu cầu, source hiện có, kiểm thử đã chạy và nghiệm thu vận hành. Không ghi PASS hoặc số test từ lịch sử thành kết quả hiện tại. Trạng thái DB cần kiểm tra DB đích. Giữ quyết định chưa duyệt là OPEN; biên tập không tự tạo chính sách.

## Bảo trì

Cập nhật tài liệu cùng thay đổi API, cấu hình hoặc workflow. Snapshot lịch sử có ngày/phạm vi; mục lục chỉ tới contract hiện hành. Không tạo giấy phép, changelog, SLO hoặc cam kết hỗ trợ giả định. Chỉ công bố release/quyết định khi có quyền và evidence.
