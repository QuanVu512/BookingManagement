# Điều kiện phát hành thương mại

Đây là danh sách việc còn mở, không phải chứng nhận tuân thủ hay phê duyệt deploy. Owner giữ quyền quyết định kinh doanh; legal/finance xác nhận nghĩa vụ áp dụng. Source và test xanh không thay hồ sơ ký duyệt. Các mục bị hoãn tiếp tục hoãn cho đến khi có quyết định rõ ràng.

## Hồ sơ và quyết định

- [ ] **Danh tính kinh doanh (O01):** owner xác minh chủ thể ký hợp đồng, tên pháp lý/thương mại, địa chỉ, đăng ký/mã thuế và giấy phép cơ sở nếu áp dụng. Cung cấp evidence riêng tư; chỉ công bố projection đã duyệt. [Business manifest](../backend/src/modules/legal-content/content/policy-manifest.json) tiếp tục `DRAFT_PENDING_OWNER` đến khi có dữ liệu thật.
- [ ] **Chính sách công bố (O03/O08):** duyệt Privacy, Terms, Cookies, Refund policy và ngoại lệ hủy do cơ sở/lỗi thanh toán, thời gian xử lý hoàn. Chính sách booking mới đã chốt: cả Member/Guest cọc 30%, không chọn trả trước 100%; tại hoặc trước T−12h giữ 10% và hoàn 20%, sau T−12h/no-show mất cọc 30%, loại dịch vụ bổ sung khỏi base phạt. Không mở lại tỷ lệ đã chốt; vẫn cần văn bản công bố và review pháp lý. Không sửa giao dịch lịch sử.
- [ ] **Thủ tục TMĐT và phạm vi thị trường (O02/O10):** owner/legal xác định mô hình, thủ tục thông báo/đăng ký hoặc nghĩa vụ hành chính tương ứng, rồi lưu xác nhận và link kiểm tra nếu cần. Không gắn huy hiệu khi chưa có evidence. Phạm vi kinh doanh được owner chọn là đặt sân trực tiếp ở Việt Nam, VNĐ; điều này không tự chứng minh miễn mọi nghĩa vụ ngoại biên.
- [ ] **Quyền dữ liệu và retention (O04/O12):** duyệt lịch từng dataset/chứng từ/backup, legal holds, cách đóng tài khoản/ẩn danh, xác minh nhạy cảm và guest mất token, lịch phản hồi/escalation và người được phân quyền xử lý. Giữ purger, anonymization identifiers và hard deletion ở trạng thái hoãn; xem [inventory](PRIVACY-DATA-INVENTORY.md).
- [ ] **Nhà cung cấp (O05):** xác minh payOS, SMTP và hạ tầng thực dùng, region/subprocessors, transfer, retention, sự cố/xóa dữ liệu; hoàn tất DPA hoặc bằng chứng phù hợp khi cần. Chưa có evidence thì giữ trạng thái chưa xác minh, không tuyên bố không chuyển dữ liệu ra ngoài.
- [ ] **Liên hệ và tài sản (O07/O09):** thay email/hotline mẫu bằng kênh đã thử; duyệt quy trình hỗ trợ. Có quyền ảnh sân/sản phẩm, logo và notices/license font đúng bản, hoặc thay tài sản thiếu quyền. Metadata nguồn/AI không đủ để kết luận có license.

## Các khoảng triển khai cần xác minh

- [ ] Khớp đúng ranh giới **T−12h** trong [deposit-forfeiture.ts](../backend/src/modules/bookings/domain/deposit-forfeiture.ts) và policy copy: source hiện dùng `>=` cho hủy muộn, trái chính sách cho phép hủy thường tại mốc này. Kiểm tra ngay trước/đúng/ngay sau mốc; giữ lịch sử và receipt/refund invariants.
- [ ] Gắn acceptance thực vào booking server: guest cần validation tương đương member; snapshot cần liên kết phiên bản/bundle/hash phù hợp thay vì suy ra checkbox từ `acceptedAt`. [Hai create-hold use case](LEGAL-AND-PRIVACY.md) hiện còn dùng `mvp-hold-v1`.
- [ ] Nối và thử HTTP từ privacy/support UI đến backend. Client gọi `/api/...` tương đối nhưng controller chưa có prefix đó và Next chưa có rewrite. Không coi rendering test là bằng chứng gửi yêu cầu thành công.
- [ ] Thay store privacy/support trong memory bằng persistence được thiết kế và kiểm thử; triển khai quyền staff/reviewer, xác minh guest, export/fulfilment, idempotency theo subject và status lookup an toàn. Duyệt deadline/calendar thay cho các giá trị mặc định kỹ thuật. Không tuyên bố đã có migration cho các bảng này chỉ từ báo cáo cũ.
- [ ] Xác minh backend chạy từ artifact build vẫn có policy manifest; thêm hoặc kiểm chứng packaging JSON cần thiết. Đối chiếu hash/version và nội dung FE/API; [checker](../tools/legal-content-check.mjs) hiện chỉ chạy trực tiếp, chưa có package alias/CI gate.
- [ ] Kiểm tra minimization webhook/log/SDK errors, scope quyền và browser storage; khi thêm tracker phải thử chặn trước consent, từ chối/thu hồi và dọn dữ liệu. Giữ registry tùy chọn rỗng như quyết định O06; 180 ngày là thời hạn consent đã chọn. Automated payouts tiếp tục tắt theo [payment constants](../backend/src/modules/payments/payment.constants.ts).

## Evidence trước phát hành

Lưu riêng hồ sơ danh tính/phê duyệt policy, thủ tục hành chính, vendor/asset rights và lịch retention; chỉ dùng reference đã lọc trong tài liệu public. Cần evidence staging cho luồng member/guest cọc 30%, cutoff/refund/no-show, acceptance, quyền dữ liệu/support, mail delivery, cookie consent và packaging FE/API. Kiểm tra migrations trên môi trường test phù hợp, backup/restore, access controls và rollback trước khi chủ sở hữu cấp quyền deploy. Không chạy migration, gửi email/thanh toán thật hoặc thay dữ liệu production chỉ để hoàn thành checklist tài liệu.
