# Nguồn tham khảo

Các commit HEAD quan sát bằng `git ls-remote` ngày 2026-10-29; không cài hay sao chép source upstream. Các skill ở đây là hướng dẫn tự viết, không kèm nội dung upstream. Kiểm tra license tại upstream trước khi tái sử dụng trực tiếp.

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills), `eb07f19f52c2669f2364897aaa293e2aaddd7b1c`: bộ skill kỹ thuật, có phạm vi giao với review; không cài thêm reviewer tự kích hoạt.
- [mattpocock/skills](https://github.com/mattpocock/skills), `59db609eb1e18aaf59b63284d0e52255aff0c63c`: bộ workflow kỹ thuật; không cần nhân bản để handoff theo role.
- [coder/coder](https://github.com/coder/coder), `8d643afee489c21f8cf3967845ce3211f736a14c`: nền tảng môi trường phát triển/agent, không phải review skill tối thiểu cần cài cho task này.
- [amirbena/code-review-skill](https://github.com/amirbena/code-review-skill), `04c99479d1ec9efc37aa72fa7995b02a406b6e55`: review theo policy; cân nhắc nguyên tắc bằng chứng và ranh giới policy, không cài reviewer trùng.
- [google/eng-practices](https://github.com/google/eng-practices), `3bb3ec25b3b0199f4940b1aa75f0ac5c5753301c`: hướng dẫn review và tiêu chuẩn chấp nhận; sử dụng ý tưởng review chất lượng và yêu cầu, không sao chép văn bản.

Đánh giá trên dựa vào mô tả repository, chưa audit toàn bộ nội dung hoặc license từng thành phần. Không khẳng định đã tích hợp nguyên văn, không dùng component có license chưa xác minh.
