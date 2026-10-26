# Đọc và xử lý CI thất bại

## Bắt đầu từ đúng run và đúng lỗi

Vào **GitHub → Actions → workflow → run → job đỏ → step đỏ**. Ghi lại commit SHA, tên step, lệnh, phiên bản Node/npm, hệ điều hành và service test. Mở cả phần log ngay trước lỗi. `Process completed with exit code 1` chỉ cho biết lệnh thất bại; nguyên nhân thường nằm phía trên. Các step phía sau có thể bị bỏ qua, nên sửa một lỗi chưa chứng minh cả workflow xanh.

Nếu đã đăng nhập GitHub CLI, có thể đọc mà không sửa repository:

```powershell
gh run list --repo QuanVu512/BookingManagement --limit 5
gh run view 40309717156 --repo QuanVu512/BookingManagement --log-failed
```

Thay run ID bằng lần thất bại đang điều tra. Có thể lưu log local để tìm `error`, `FAIL`, `Caused by`, `Expected`, `Received`, `ECONNREFUSED`. Không chia sẻ log chưa kiểm tra credential, token và dữ liệu cá nhân. GitHub hỗ trợ tải log và permalink đến dòng lỗi: [tài liệu log](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs).

## Ví dụ thực tế: Jest không nạp được NestJS

Run [40309717156](https://github.com/QuanVu512/BookingManagement/actions/runs/40309717156), commit `5caef836`, step booking, báo:

```text
Test suite failed to run
Cannot require() ES Module .../@nestjs/common/index.js in a cycle.
(from .../@nestjs/throttler/dist/throttler.decorator.js)
Tests: 0 total
```

Cách đọc:

- `Test suite failed to run` và `Tests: 0 total`: lỗi khi nạp suite, chưa có assertion nghiệp vụ nào chạy.
- `@nestjs/common/index.js`: module ESM đang bị yêu cầu đồng bộ khi graph import của Jest chưa hoàn tất.
- `@nestjs/throttler/...`: nơi dùng CommonJS `require('@nestjs/common')` để đi vào graph đó.
- `jest-runtime/...`: loader phát hiện vòng lặp; không có nghĩa phải sửa trực tiếp file này.
- `ExperimentalWarning: VM Modules`: cảnh báo chế độ ESM, không phải dòng gây exit 1 trong trường hợp này.

Dependency đã khóa: Nest common/core/testing `12.1.2` dùng ESM; throttler `6.7.1` dùng CommonJS; Jest `30.5.2`, ts-jest `29.4.14`. Node CI `24.21.0`; lỗi cũng tái hiện trên Node local `24.17.0`, nên không có cơ sở kết luận chỉ Ubuntu hoặc chỉ timezone gây lỗi.

Bản sửa thêm `setupFiles` trong [Jest config](../backend/jest.config.js), chạy [setup ESM](../backend/test/setup-nest-esm.mjs) trước graph test để common/core đã nạp xong khi plugin CJS gọi require. Giữ ESM, dependency lock và guard thật. [Jest giải thích setupFiles](https://jestjs.io/docs/configuration#setupfiles-array); [ESM/require trong Jest](https://jestjs.io/docs/ecmascript-modules#require-of-esm).

Lệnh kiểm tra độc lập, không cần DB/Redis:

```powershell
npm run test:backend:runtime
```

Test này mở HTTP server trên loopback/cổng tự cấp, dùng `ThrottlerGuard` thật: hai request được 200, request thứ ba bị 429 và có `Retry-After`. Không mock Nest/throttler.

Sau khi sửa loader, chạy booking với storage thật phát hiện thêm hai expectation cũ: mặc định cọc 100% và input 100% khi replay trả 409. Chính sách tạo mới đã bắt buộc 30%; DTO chỉ nhận 30 nên input 100% bị HTTP validation trả 400 trước use case. Test được cập nhật thành 30%/30.000 trên tổng 100.001 VND và 400; các kiểm tra xung đột idempotency 409 khác vẫn giữ nguyên. Không sửa logic ứng dụng để chiều test.

## Phân loại những lỗi thường gặp

| Dấu hiệu                                                  | Nhóm cần điều tra                  | Cách kiểm tra tiếp                                                              |
| --------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| Workflow syntax / Invalid workflow                        | YAML hoặc cấu hình Actions         | Đọc annotation, indent, key và quyền; job có thể chưa chạy                      |
| npm ci / ERESOLVE / lock mismatch                         | Dependency và lockfile             | So Node/npm, package.json/lock, peer dependency; không dùng force tùy tiện      |
| Cannot require / SyntaxError / Cannot find module; 0 test | Loader, module hoặc transform      | Kiểm tra ESM/CJS, exports, Jest config và import graph                          |
| TSxxxx / build error                                      | Type hoặc compile                  | Đọc file:dòng và diagnostic đầu tiên; chạy build vùng liên quan                 |
| Expected/Received, có tên test                            | Assertion hoặc contract            | Đọc cả setup/input/expected/actual; đối chiếu yêu cầu trước khi đổi expected    |
| ECONNREFUSED / timeout / Redis unavailable                | Môi trường hoặc service            | Kiểm readiness, URL/cổng và healthcheck; timeout không tự chứng minh app chậm   |
| SQLSTATE 23514 / 23505 / migration error                  | Constraint, fixture hoặc migration | Xác định constraint, trạng thái migration và DB test; không reset DB có dữ liệu |
| 401 / 403 / 429                                           | Auth, CSRF, quyền hoặc rate limit  | Đối chiếu tài khoản test, cookie/header, quota; không tắt guard để vượt test    |
| audit high/critical                                       | Dependency security gate           | Đọc advisory và dependency cha; vá trong scope rồi kiểm lại                     |
| Process killed / OOM / timeout job                        | Tài nguyên hoặc vòng chờ           | Đọc log runner, thời lượng, process/handle; không chỉ tăng timeout              |

Cùng thông báo có thể có nhiều nguyên nhân. Dùng stack, phiên bản và một phép kiểm chứng có thể phân biệt các giả thuyết.

## Tái hiện và tra cứu có căn cứ

1. Kiểm SHA của run, `git status`, `.nvmrc`, `node --version`, `npm --version`. Giữ thay đổi local. Khi cần checkout commit cũ, dùng worktree riêng.
2. Đọc lệnh trong [workflow](../.github/workflows/ci.yml) và [package.json](../package.json). Trên checkout sạch, dùng `npm ci` theo lock thay vì nâng dependency đại trà.
3. Chạy đúng test fail trước. PowerShell dùng `$env:TZ='UTC'` rồi `npm run test:booking:integration`; cú pháp `TZ=UTC npm ...` thuộc shell Linux.
4. Storage suite cần URL tường minh: `BOOKING_DATABASE_TEST_URL` chỉ tới DB loopback riêng tên `booking_mvp_test`, `BOOKING_REDIS_TEST_URL` tới Redis test riêng. Bật `$env:BOOKING_REQUIRE_STORAGE='true'` để thiếu URL phải fail. DB phải đã được migrate; xem [BOOKING-MVP](BOOKING-MVP.md) và [pipeline](PIPELINES.md). Không trỏ tới production hoặc Redis đang chứa dữ liệu thật. Suite có thao tác ghi/xóa fixture và queue.
5. Tìm lỗi bằng phần ổn định, bỏ đường dẫn cá nhân: `"Cannot require() ES Module" "in a cycle" Jest 30.5 NestJS 12 throttler`. Đối chiếu tài liệu chính thức và issue đúng package/phiên bản. Kết quả tìm kiếm là giả thuyết, không phải bằng chứng bản vá phù hợp.
6. Đọc source tối thiểu ở vị trí stack chỉ đến. Thử một thay đổi có lý do; lưu lỗi trước sửa và kết quả sau sửa. Đừng sửa node_modules, bỏ test, tắt security guard hoặc thay expected chỉ để xanh.
7. Sau focused test, chạy kiểm tra các consumer chung bị ảnh hưởng. Cấu hình Jest backend ảnh hưởng cả unit và integration; frontend có config riêng. Ghi rõ passed/failed/skipped, storage thật hay mock, phần chưa chạy. Workspace dừng retry sau ba lần fail liên tiếp cùng phạm vi; không né bộ chặn.

## Xác nhận bản sửa trên GitHub

`Re-run jobs` chạy lại **cùng SHA/ref** của run cũ, không lấy bản sửa chưa push. Vì vậy bản vá local phải được review và commit/push theo quyền user trước khi một run mới kiểm chứng nó. Chỉ rerun cùng SHA khi đang kiểm tra lỗi tạm thời hoặc thu thập thêm log; [GitHub mô tả semantics rerun](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

Khi cần nhờ hỗ trợ, cung cấp: link run + SHA, step/lệnh, lỗi đầu tiên có ý nghĩa cùng stack, phiên bản/môi trường, cách tái hiện, expected/actual, thay đổi gần nhất và những kiểm tra đã chạy. Che credential. Một log như vậy giúp phân biệt lỗi ứng dụng, test và hạ tầng nhanh hơn chỉ gửi dòng exit code.
