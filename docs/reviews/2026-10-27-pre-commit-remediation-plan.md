# ĐÁNH GIÁ ĐỘC LẬP QA & KẾ HOẠCH KHẮC PHỤC TRƯỚC COMMIT (PRE-COMMIT REMEDIATION PLAN)

- **Dự án:** BookingManagement / SMASH ARENA (Pickleball Club)
- **Ngày lập:** 27/10/2026 (Giờ Việt Nam)
- **Người thực hiện:** Senior QA Reviewer & Software Architect (Antigravity CLI / `Gemini 3.8 Flash`)
- **Vai trò chuyên môn:** `agency-code-reviewer` kết hợp `agency-software-architect`
- **Tài liệu đối chiếu gốc:** `coordination/reports/2026-10-27-system-qa-review.md`
- **Ảnh bằng chứng:** `qa-account-mobile.jpg`, `qa-home-mobile.jpg`, `qa-privacy-mobile.jpg`, `qa-support-mobile.jpg`, `qa-support-desktop.jpg`
- **Chế độ hành động:** Read-Only Review & Planning (Không sửa source code sản phẩm/test, không migrate/seed DB, không commit/push).

---

## A. EXECUTIVE SUMMARY (TÓM TẮT ĐIỀU HÀNH)

### 1. Tổng quan hiện trạng codebase
Dự án **BookingManagement / SMASH ARENA** đã xây dựng một nền tảng kỹ thuật và nghiệp vụ backend rất vững chắc (NestJS + Prisma + PostgreSQL + Redis/BullMQ), bảo vệ tính toàn vẹn dữ liệu bằng PostgreSQL exclusion constraints chống trùng lịch, khóa phân tán idempotency, và state machine rõ ràng.

Tuy nhiên, trước thời điểm commit/push, dự án tồn tại sự phân mảnh giữa **đặc tả tài liệu lịch sử**, **hành vi giao diện frontend (Next.js)** và **môi trường kiểm thử tự động**:
1. **Chính sách đặt cọc & hủy (F2):** Không phải là lỗi code hay câu hỏi nghiệp vụ còn bỏ ngỏ. Code backend (DTO, Use Cases, Domain), Database schema (`schema.prisma`), và Frontend booking form **đều đã thực thi đúng chính sách chính thức chốt ngày 26/10/2026** (Cọc bắt buộc 30% tiền thuê sân cho cả Member và Guest; T-12h hoàn 20% giữ 10%; trong 12h/NO_SHOW mất toàn bộ cọc 30%). Điểm bất nhất duy nhất là **tài liệu lập kế hoạch cũ (`docs/PROJECT.md`, `docs/WORKFLOWS.md`, `docs/ARCHITECTURE.md`) chưa được cập nhật đồng bộ (`STALE_DOCUMENTATION`)**, khiến agent QA trước đó đánh dấu nhầm thành `CONTRACT OPEN`.
2. **Lỗi tràn màn hình và cắt xén giao diện mobile (F1):** Đã được xác nhận (`CONFIRMED`). Header trang pháp lý (`legal-page-shell.tsx`) bị tràn ngang trên màn hình `< 640px` (đặc biệt `320px`, `375px`, `390px`, `484px`). Form hỗ trợ (`support-case-form.tsx`) dùng grid 2 cột cứng ép ô nhập số điện thoại bị co cụm và cắt xén.
3. **Lẫn lộn trạng thái Lỗi / Rỗng trên trang chủ (F3):** Đã được xác nhận (`CONFIRMED`). Khi backend offline, trang chủ vừa hiển thị thông báo lỗi mạng kèm nút "Thử lại", vừa đồng thời render danh mục sân trống với các tab lọc `(0)` và thông điệp rỗng `Không có sân phù hợp với bộ lọc hiện tại.` gây hiểu lầm cho người dùng.
4. **Bất nhất nhận diện thương hiệu & bố cục Account (F4):** Đã được xác nhận (`CONFIRMED`). Giao diện người dùng bị trộn lẫn giữa tên kỹ thuật repository (`BookingManagement`) và thương hiệu hiển thị chính thức (`SMASH ARENA`). Trang `/account` có khoảng đệm 0px bám sát lề trái trên mobile và sự chuyển tiếp đột ngột giữa Header tối thể thao và Body/Footer sáng.
5. **Cảnh báo test & cấu hình build (F5):** Đã được xác nhận (`CONFIRMED`). Cảnh báo Jest về JSON import attributes; `npm run build:web` yêu cầu biến `NEXT_PUBLIC_API_URL` phải là HTTPS origin; 51 integration tests bị bỏ qua (`SKIP`) do thiếu biến môi trường kết nối database/redis test dùng một lần.

### 2. Tổng hợp số liệu rà soát
- **Tổng số findings ban đầu đã kiểm tra:** 5 findings (F1 – F5).
- **Số findings được xác nhận đúng nguyên trạng:** 4 findings (F1, F3, F4, F5).
- **Số findings cần điều chỉnh phân loại:** 1 finding (F2 — chuyển từ `CONTRACT OPEN` thành `STALE_DOCUMENTATION` vì code và test thực tế đã là `CONTRACT_CORRECT`).
- **Số findings mới phát hiện (Additional Findings):** 5 findings (AF1 – AF5).
- **Tổng số task khắc phục đề xuất:** 10 tasks (2 Task P0, 4 Task P1, 4 Task P2).
- **Đánh giá mức độ sẵn sàng Commit (Commit Readiness):** **ĐẠT ĐIỀU KIỆN COMMIT TRÊN NHÁNH DEV SAU KHI SỬA P0 & P1**. Chưa đạt điều kiện Release Production do thiếu môi trường CI/CD, payOS provider config và email SMTP production.

---

## B. VERIFIED FINDINGS (ĐỐI CHIẾU CHI TIẾT F1 – F5)

### Bảng tổng hợp đối chiếu F1 – F5

| ID | Tên phát hiện | Đánh giá tính chính xác | Phân loại bản chất | Severity gốc | Severity chuẩn hóa | Trạng thái hiện tại |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F1** | Responsive Overflow (Legal & Support) | **CHÍNH XÁC** | Lỗi CSS / Layout Mobile | Cao | **P1 (Cao)** | `CONFIRMED` |
| **F2** | Payment Contract Inconsistency | **CẦN ĐIỀU CHỈNH** | Tài liệu cũ lệch Code chuẩn | Cao | **P0 (Tài liệu)** | `STALE_DOCUMENTATION` |
| **F3** | Home Error & Empty State Conflation | **CHÍNH XÁC** | Lỗi luồng hiển thị State | Trung bình | **P0 (Nghiệp vụ UX)** | `CONFIRMED` |
| **F4** | UI/UX & Brand Inconsistency | **CHÍNH XÁC** | Bất nhất Thương hiệu & Padding | Trung bình | **P1 (Trung bình)** | `CONFIRMED` |
| **F5** | Test Warnings & Build Config | **CHÍNH XÁC** | Cảnh báo Tooling & Env Gaps | Thấp | **P2 (Bảo trì)** | `CONFIRMED` |

---

### Phân tích chi tiết từng phát hiện

#### F1 — RESPONSIVE OVERFLOW TRÊN MÀN HÌNH NHỎ (LEGAL & SUPPORT)
1. **Tính chính xác:** Chính xác 100%. Ảnh chụp màn hình `qa-privacy-mobile.jpg` và `qa-support-mobile.jpg` thể hiện rõ nút "Đặt sân ngay" và input điện thoại bị tràn/cắt lề.
2. **Bằng chứng trực tiếp:**
   - Tại `qa-privacy-mobile.jpg`: Navigation bar ép 4 liên kết văn bản và nút "Đặt sân ngay" tràn khỏi cạnh phải màn hình. Tại viewport 484px, `documentElement.scrollWidth = 494px` (vượt 10px). Tại 390px, độ tràn đo được vượt trên 100px.
   - Tại `qa-support-mobile.jpg`: Viewport 484px ghi nhận `scrollWidth = 554px` (tràn 70px), cột input "Số điện thoại liên hệ" bị co hẹp và ép sát mép cắt.
3. **Nguyên nhân gốc:**
   - Trong `frontend/features/legal/components/legal-page-shell.tsx:17-26`: Thẻ `<header>` sử dụng inline styles với `display: flex; justify-content: space-between; align-items: center;` nhưng **hoàn toàn không có `flex-wrap: wrap`**, không có media query responsive, `gap: 1.5rem` cố định khiến chiều rộng tối thiểu của header vượt quá 500px.
   - Trong `frontend/features/support/components/support-case-form.tsx:112`: Khối nhập liệu dùng inline style `display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;` mà không có breakpoint để chuyển thành 1 cột trên mobile. Các thẻ `<input>` có `min-width: auto` mặc định của browser nên không thể co nhỏ dưới ngưỡng nội dung placeholder, làm bể grid.
4. **File chịu trách nhiệm:**
   - `frontend/features/legal/components/legal-page-shell.tsx` và `legal.module.css`.
   - `frontend/features/support/components/support-case-form.tsx` và `support.module.css`.
5. **Severity:** P1 (Functional UX / Responsive blocker trên mobile).
6. **Lỗi liên quan chưa phát hiện:** Các trang legal khác (`/terms`, `/cookies`, `/refund-policy`, `/privacy/requests`) đều dùng chung `LegalPageShell`, do đó đều bị chung lỗi overflow header này.
7. **Giải pháp tối thiểu:**
   - Chuyển inline style của header sang class trong `legal.module.css`. Áp dụng `flex-wrap: wrap; gap: 0.75rem 1rem;`. Trên màn hình `< 640px`, cho navigation links xuống dòng gọn gàng, nút "Đặt sân ngay" co giãn linh hoạt hoặc nằm ở hàng điều hướng.
   - Chuyển `grid-template-columns: 1fr 1fr` trong form support sang class `.formRow2Col` trong `support.module.css`. Mặc định mobile `grid-template-columns: 1fr;`, từ `@media (min-width: 640px)` mới hiển thị `1fr 1fr`. Thêm `min-width: 0; width: 100%;` cho input.
   - **Tuyệt đối không dùng `overflow-x: hidden`** trên thẻ `body` hay container để giấu lỗi.
8. **Nguy cơ regression:** Rất thấp nếu giữ nguyên style desktop (`>= 768px`).
9. **Kiểm chứng cần thiết:** Đo kích thước thực tế bằng Playwright / DevTools tại các viewport: `320x568`, `375x667`, `390x844`, `484x844`, `768x1024`, `1024x768`, `1280x800`. Kiểm tra `window.innerWidth === document.documentElement.scrollWidth`.

---

#### F2 — CHÍNH SÁCH ĐẶT CỌC VÀ HỦY SÂN (PAYMENT CONTRACT INCONSISTENCY)
1. **Tính chính xác:** Nhận định của báo cáo cũ về việc "hệ thống có mâu thuẫn" là đúng trên bề mặt tài liệu, nhưng **kết luận coi đây là vấn đề kỹ thuật chưa giải quyết là SAI**. Quyết định ngày 26/10/2026 của Product Owner đã là chuẩn mực tối thượng.
2. **Bằng chứng trực tiếp:**
   - `backend/src/modules/bookings/presentation/dto/booking-request.dto.ts:54`: `@IsIn([30]) prepaymentPercent?: 30;` (Bắt buộc 30, chặn mọi giá trị khác).
   - `backend/src/modules/bookings/application/create-hold.use-case.ts:110-122`: Ép `percent = 30;` và tính `prepaymentAmountFor(quote.totalAmount, 30)`.
   - `backend/src/modules/payments/presentation/guest-bookings.controller.ts:47`: `@IsIn([30]) prepaymentPercent?: number;`.
   - `backend/src/modules/payments/application/guest-create-hold.use-case.ts:65`: Thao tác ném `GUEST_PREPAYMENT_30_ONLY` nếu `percent !== 30`.
   - `backend/prisma/schema.prisma:424-427`: Trường `prepaymentPercent Decimal` ghi rõ snapshot 30 hoặc 100 lịch sử, tạo mới bắt buộc 30.
   - `frontend/components/arena/arena-booking-page.tsx:19, 46`: `const prepaymentPercent = 30 as const;` và văn bản ghi rõ cọc 30% cho cả thành viên và vãng lai.
   - `docs/DATABASE.md:65`, `docs/RELEASE-REQUIREMENTS.md:8`, `docs/LEGAL-AND-PRIVACY.md:51`: Đã cập nhật chính sách cọc 30% từ 26/10/2026.
   - Chỉ có `docs/PROJECT.md:5` và `docs/WORKFLOWS.md:10` là tài liệu cũ chưa sửa câu chữ.
3. **Nguyên nhân gốc:** Người tiền nhiệm cập nhật code, test, DB migration và tài liệu release nhưng bỏ sót 2 file tổng quan `docs/PROJECT.md` và `docs/WORKFLOWS.md`.
4. **File chịu trách nhiệm:** `docs/PROJECT.md`, `docs/WORKFLOWS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE-DESIGN.md`.
5. **Severity:** P0 về tính chuẩn xác tài liệu kiến trúc, nhưng không phải bug mã nguồn.
6. **Lỗi liên quan chưa phát hiện:** Quy tắc hủy tại mốc T-12h:
   - Trước/tại T-12h: `quoteAggregateCancellation` (phạt 10%, hoàn phần còn lại -> khách trả 30% cọc thì phạt 10%, hoàn 20%).
   - Sau T-12h (trong vòng 12h trước giờ bắt đầu): `isInLateCancelWindow` trong `deposit-forfeiture.ts` kích hoạt; khách không được tự hủy, nhân viên xử lý `staff-late-cancellation` hoặc hệ thống quét `mark-no-show` tịch thu toàn bộ cọc 30%. Khách từng trả 100% lịch sử được hoàn 70%.
7. **Giải pháp tối thiểu:** Sửa văn bản trong `docs/PROJECT.md` và `docs/WORKFLOWS.md` cho khớp 100% với quyết định chính thức ngày 26/10/2026. Tuyệt đối không thay đổi logic code 30% đang chạy đúng.
8. **Nguy cơ regression:** Không có nguy cơ regression mã nguồn.
9. **Kiểm chứng cần thiết:** `npm run test:booking:deposit:integration`, `npm run test:auth:contract`, `npm test` frontend/backend.

---

#### F3 — HIỂN THỊ ĐỒNG THỜI TRẠNG THÁI LỖI MẠNG VÀ DANH MỤC RỖNG TRÊN TRANG CHỦ
1. **Tính chính xác:** Chính xác 100%. Đã tái hiện và đối chiếu trực tiếp trong mã nguồn.
2. **Bằng chứng trực tiếp:**
   - Khi API `http://localhost:4002` không kết nối, ảnh `qa-home-mobile.jpg` và mã nguồn `frontend/app/page.tsx:16-30` cho thấy:
     - Đoạn văn báo lỗi: `Không tải được danh mục sân. Vui lòng thử lại. [Thử lại]`
     - Ngay bên dưới là component `<CourtCatalogView courts={courts} />` được render với `courts = []`.
     - `CourtCatalogView` tiếp tục render các tab lọc `Tất cả sân (0)`, `Sân VIP (0)`, `Sân tiêu chuẩn (0)` và thông báo `Không có sân phù hợp với bộ lọc hiện tại.`.
3. **Nguyên nhân gốc:**
   - Trong `frontend/app/page.tsx:30`: Component `<CourtCatalogView courts={courts} />` được gọi vô điều kiện, không kiểm tra cờ `error` hay `loading`. Khi API lỗi, hook `useCourtCatalog` trả về `courts: []` và `error: '...'`. Việc truyền `courts: []` vào `CourtCatalogView` làm kích hoạt nhánh render empty state của danh mục.
4. **File chịu trách nhiệm:** `frontend/app/page.tsx`, `frontend/features/courts/components/court-catalog-view.tsx`.
5. **Severity:** P0 (Trải nghiệm người dùng cốt lõi & hiển thị sai trạng thái hệ thống).
6. **Lỗi liên quan chưa phát hiện:** Tương tự khi đang `loading = true`, nếu render `CourtCatalogView` thì các nút lọc cũng sẽ chớp nháy số `(0)` trước khi dữ liệu tải xong.
7. **Giải pháp tối thiểu:**
   - Trong `frontend/app/page.tsx`:
     ```tsx
     {loading && <ArenaLoadingSkeleton />}
     {error && !loading && (
       <div className="arena-error-banner" role="alert">
         <p>{error}</p>
         <button className="arena-button" onClick={retry}>Thử lại</button>
       </div>
     )}
     {!loading && !error && courts.length === 0 && (
       <p className="arena-empty" role="status">Chưa có sân nào đang hoạt động.</p>
     )}
     {!loading && !error && courts.length > 0 && (
       <CourtCatalogView courts={courts} />
     )}
     ```
   - Đảm bảo khi có lỗi mạng, chỉ hiện Error banner + nút Retry; KHÔNG render filter tabs `(0)` hay dòng "Không có sân phù hợp".
8. **Nguy cơ regression:** Rất thấp, cải thiện độ ổn định và tuân thủ Nielsen Heuristic #1 (Visibility of system status).
9. **Kiểm chứng cần thiết:** Unit test render trạng thái trong `frontend/__tests__/frontend-home-appearance.spec.tsx`: Mock API reject -> verify chỉ xuất hiện alert lỗi và nút Thử lại, không có text `(0)` hay "Không có sân phù hợp".

---

#### F4 — BẤT NHẤT THƯƠNG HIỆU (SMASH ARENA VS BOOKINGMANAGEMENT) & BỐ CỤC ACCOUNT
1. **Tính chính xác:** Chính xác 100%. Ảnh `qa-account-mobile.jpg` cho thấy rõ sự pha trộn giữa header tối và thân trang sáng, nội dung dính sát lề.
2. **Bằng chứng trực tiếp:**
   - `qa-account-mobile.jpg`: Header là `SportyHeader` của SMASH ARENA (nền tối, chữ xanh neon). Thân trang là `AccountShell` nền trắng bệt, nội dung tiêu đề và text "Đang kiểm tra phiên..." dính sát mép trái (0px padding). Dưới chân trang là `LegalFooter` ghi "BookingManagement Sports Arena".
   - `qa-privacy-mobile.jpg` & `qa-support-desktop.jpg`: Header ghi `← BookingManagement`.
   - `frontend/features/cookie-consent/components/cookie-banner.tsx:26`: Ghi "BookingManagement sử dụng các cookie...".
3. **Nguyên nhân gốc:**
   - Dự án chuyển đổi thương hiệu giao diện sang **SMASH ARENA Pickleball Club** cho khách hàng, nhưng một số trang tính năng sau (`features/legal`, `features/support`, `features/cookie-consent`, `components/account`) vẫn giữ nguyên tên kỹ thuật repository `BookingManagement`.
   - Trong `frontend/components/account/account-shell.module.css:1`: `.page { padding: 32px 0 64px; }` thiết lập padding trái/phải bằng 0, phụ thuộc vào class `.container`. Nhưng trên màn hình nhỏ, `.container` không có padding an toàn khiến chữ ép sát mép kính điện thoại.
   - `frontend/app/account/layout.tsx`: Kết hợp `SportyHeader` (Dark theme) với `LegalFooter` (Light theme) mà không có lớp wrapper style nền chuyển tiếp đồng bộ.
4. **File chịu trách nhiệm:**
   - `frontend/features/legal/components/legal-page-shell.tsx`
   - `frontend/features/legal/components/legal-footer.tsx`
   - `frontend/features/cookie-consent/components/cookie-banner.tsx`
   - `frontend/components/account/account-shell.module.css`
   - `frontend/app/account/layout.tsx`
5. **Severity:** P1 (Thẩm mỹ, tính nhất quán thương hiệu và công thái học mobile).
6. **Lỗi liên quan chưa phát hiện:** Việc chuyển trang từ Home (Dark mode) sang Privacy/Support (Light mode) là chấp nhận được theo quyết định thiết kế ("không bắt buộc mọi trang dùng dark mode, trang văn bản pháp lý giữ nền sáng dễ đọc"), nhưng tên thương hiệu hiển thị bắt buộc phải thống nhất là **SMASH ARENA**.
7. **Giải pháp tối thiểu:**
   - Thống nhất chuỗi hiển thị thương hiệu: Đổi toàn bộ các vị trí text hiển thị cho user từ `BookingManagement` thành `SMASH ARENA` (hoặc `SMASH ARENA - Pickleball Club`). Giữ `BookingManagement` làm tên package/repo nội bộ.
   - Trong `account-shell.module.css`: Thêm `padding: 2rem 1rem 4rem;` (có padding ngang tối thiểu 16px trên mobile).
   - Trong `account/layout.tsx`: Bọc phần nội dung trong container có background và màu chữ nhất quán, tránh hiệu ứng "cắt khúc" thị giác.
8. **Nguy cơ regression:** Không ảnh hưởng logic nghiệp vụ.
9. **Kiểm chứng cần thiết:** `frontend/__tests__/frontend-account-rendering.spec.tsx` và `frontend/__tests__/legal-pages-rendering.spec.tsx`.

---

#### F5 — CẢNH BÁO TEST & CẤU HÌNH BUILD
1. **Tính chính xác:** Chính xác 100%.
2. **Bằng chứng trực tiếp:**
   - `npm test` sinh cảnh báo Node ESM: `ExperimentalWarning: Importing JSON modules is an experimental feature...` xuất phát từ `frontend/__tests__/legal-pages-rendering.spec.tsx:8-10`.
   - `npm run build:web` gặp lỗi: `NEXT_PUBLIC_API_URL must be an HTTPS origin (HTTP loopback only in development/test)` từ `frontend/constants/public-origin.mjs:23`.
   - Phiên bản Node local là `v24.17.0`, trong khi `.nvmrc` ghi `24.21.0`.
   - 51 integration tests bị `SKIP` trong 4 test suites: `test:booking:integration` (16 tests), `test:payments:integration` (12 tests), `test:auth:storage` (7 tests), `test:booking:deposit:integration` (16 tests).
3. **Nguyên nhân gốc:**
   - Import JSON: Node v24 yêu cầu cú pháp import attributes `import doc from './file.json' with { type: 'json' };`.
   - Build web origin: File `frontend/constants/public-origin.mjs` có hàm guard `resolvePublicApiOrigin(value, production)` chặn nghiêm ngặt các URL không phải HTTPS khi chạy `next build` (vốn tự động đặt `NODE_ENV=production`). Đây là tính năng an ninh tốt, nhưng script build thiếu fallback cho CI build test.
   - Skipped tests: Các suite integration sử dụng cờ kiểm tra: `const storageDescribe = databaseUrl && redisUrl ? describe : describe.skip;`. Do không truyền URL test container nên Jest tự động skip toàn bộ suite.
4. **File chịu trách nhiệm:**
   - `frontend/__tests__/legal-pages-rendering.spec.tsx`
   - `frontend/constants/public-origin.mjs`
   - `package.json`
5. **Severity:** P2 (Chất lượng tooling và quy trình CI).
6. **Lỗi liên quan chưa phát hiện:** Script `pretest:e2e` trong `package.json:28` chạy `npm run db:test:restart`, lệnh này thực thi `docker compose rm --stop --force` xóa sạch container test database nếu chạy thiếu kiểm soát.
7. **Giải pháp tối thiểu:**
   - Cập nhật import JSON trong test sang cú pháp chuẩn hoặc đọc file qua `fs.readFileSync` + `JSON.parse`.
   - Trong script CI/build, thiết lập `NEXT_PUBLIC_API_URL=https://api.staging.smasharena.vn` (hoặc origin HTTPS giả lập an toàn) cho giai đoạn build kiểm tra cú pháp.
   - Hướng dẫn rõ ràng cách cấp `BOOKING_DATABASE_TEST_URL` và `BOOKING_REDIS_TEST_URL` để mở khóa 51 integration test mà không phá hỏng database cục bộ.
8. **Nguy cơ regression:** Không.
9. **Kiểm chứng cần thiết:** Chạy `npm test` không còn warning; chạy build web với biến môi trường hợp lệ thoát exit code 0.

---

## C. ADDITIONAL FINDINGS (CÁC PHÁT HIỆN MỚI TỪ MÃ NGUỒN)

Trong quá trình rà soát độc lập toàn diện mã nguồn, Senior Architect phát hiện thêm 5 vấn đề kỹ thuật quan trọng cần đưa vào kế hoạch khắc phục:

### AF1 — Hardcoded Brand Name Trong Cookie Consent Banner
- **Vị trí:** `frontend/features/cookie-consent/components/cookie-banner.tsx:26`.
- **Hiện tượng:** Dòng text hiển thị: *"BookingManagement sử dụng các cookie thiết yếu để đảm bảo chức năng đăng nhập, bảo mật và đặt giữ chỗ sân thể thao."*
- **Tác động:** Khi khách truy cập trang chủ `SMASH ARENA`, banner xuất hiện ở góc dưới với thương hiệu lạ `BookingManagement`, gây mất niềm tin và nghi ngờ lừa đảo/phishing.
- **Khắc phục:** Đổi thành *"SMASH ARENA sử dụng các cookie thiết yếu..."*.

### AF2 — Lỗ hổng Trải nghiệm Check-in Khi Còn Nợ Tiền Thuê Sân (Balance Due)
- **Vị trí:** `backend/src/modules/check-in/application/verify-checkin.use-case.ts:79-84`.
- **Hiện tượng:** Khi khách đến sân quét mã QR hoặc check-in thủ công, hàm `applyCheckinTx` kiểm tra:
  ```ts
  if (money.balanceDue > 0) {
    throw new ConflictException({
      code: 'INSUFFICIENT_BALANCE',
      message: 'Đơn chưa thanh toán đủ — thu đủ tiền trước khi check-in (I10).',
    });
  }
  ```
- **Phân tích:** Do chính sách mới bắt buộc cọc 30%, mọi đơn đặt sân online khi đến cơ sở đều còn nợ 70% tiền thuê sân (`balanceDue = 70%`). Nếu nhân viên quét QR check-in ngay mà chưa thực hiện thao tác thu tiền quầy (`staff-balance.use-case.ts` ghi nhận CASH/BANK), hệ thống sẽ lập tức từ chối và báo lỗi 409 `INSUFFICIENT_BALANCE`.
- **Khắc phục:** Cần bổ sung hướng dẫn rõ ràng trong UI Staff: Luồng thao tác tại quầy bắt buộc là: **Thu 70% số dư (tiền mặt / chuyển khoản) -> Xác nhận thanh toán đủ -> Mới được duyệt Check-in.**

### AF3 — Rủi ro Xóa Dữ liệu Tiềm tàng Của Hook `pretest:e2e`
- **Vị trí:** `package.json:28, 55-57`.
- **Hiện tượng:**
  ```json
  "pretest:e2e": "npm run db:test:restart",
  "db:test:restart": "npm run db:test:remove && npm run db:test:create && npm run prisma:test:deploy",
  "db:test:remove": "docker compose --env-file backend/.env.test -f infra/docker-compose.yml rm --stop --force test-database test-redis"
  ```
- **Phân tích:** Bất cứ khi nào lập trình viên hoặc test runner chạy `npm run test:e2e`, npm sẽ tự động kích hoạt `pretest:e2e`, dẫn tới việc Docker tự ý dừng (`--stop`) và xóa sạch (`--force`) container `test-database` và `test-redis`. Nếu lập trình viên cấu hình nhầm file `.env.test` trỏ tới database phát triển, toàn bộ dữ liệu mẫu sẽ bị xóa sổ ngay lập tức.
- **Khắc phục:** Tách rời lệnh restart container ra khỏi hook tự động; bổ sung tài liệu cảnh báo trong `PIPELINES.md`.

### AF4 — Sai Lệch Thời Hạn Giữ Chỗ Giữa Tài Liệu Cũ và Contract Code
- **Vị trí:** Một số tài liệu cũ ghi thời gian giữ chỗ (hold duration) là 10 phút, trong khi contract chuẩn trong `backend/src/modules/bookings/booking.constants.ts:7` là:
  ```ts
  export const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 phút
  ```
- **Phân tích:** Thời hạn 5 phút là giá trị chính xác của MVP nhằm giải phóng slot nhanh chóng cho các trận đấu thể thao cao điểm. Các tài liệu ghi 10 phút là bản nháp cũ.
- **Khắc phục:** Chuẩn hóa toàn bộ tài liệu về con số duy nhất: **5 phút (300 giây)**.

### AF5 — Thiếu Xử lý Lỗi Mạng Riêng Biệt Trong Hook `useCourtCatalog`
- **Vị trí:** `frontend/features/courts/hooks/use-court-catalog.ts:19-24`.
- **Hiện tượng:** Khối `catch` gom tất cả các loại lỗi (404, 500, Timeout, Network Error / Connection Refused) thành một chuỗi duy nhất: `"Không tải được danh mục sân. Vui lòng thử lại."`.
- **Phân tích:** Việc không phân biệt `NetworkError` (mất mạng) với `ServerError` (lỗi 500) làm frontend không thể hiển thị thông báo trợ giúp ngữ cảnh phù hợp cho người dùng (ví dụ: "Kiểm tra kết nối internet" vs "Hệ thống bảo trì").
- **Khắc phục:** Bổ sung phân loại lỗi cơ bản dựa trên instance của Error hoặc status code.

---

## D. BUSINESS RULE COMPLIANCE MATRIX (MA TRẬN TUÂN THỦ NGHIỆP VỤ)

| # | Quy tắc nghiệp vụ chính thức (Chốt 26/10/2026) | Trạng thái Code Frontend | Trạng thái Code Backend DTO | Trạng thái Logic Domain Backend | Trạng thái Database Schema | Trạng thái Tài liệu (`docs/`) | Phân loại tuân thủ |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Bắt buộc cọc 30% tiền thuê sân** cho cả Member và Guest | `arena-booking-page.tsx:19` (`prepaymentPercent = 30 as const`) | `booking-request.dto.ts:54` (`@IsIn([30])`) | `create-hold.use-case.ts:121` (`percent = 30`) | `schema.prisma:424` (`Decimal(5,2)`) | Cũ ghi Member 30/100, Guest 100 | **CONTRACT_CORRECT** (Code) / **STALE_DOCUMENTATION** (Docs) |
| **2** | **Cấm lựa chọn trả trước 100%** khi tạo booking mới | Không có option chọn 100% | Chặn ở HTTP validation (trả 400 Bad Request) | Ném `BookingValidationError` nếu khác 30 | CHECK constraint cũ đã được gỡ bỏ bằng migration | Cũ ghi được chọn 100% | **CONTRACT_CORRECT** (Code) / **STALE_DOCUMENTATION** (Docs) |
| **3** | **Cấm mọi tỷ lệ đặt cọc khác** (ngoài 30%) | Form cố định 30% | `@IsIn([30])` ở cả Member & Guest DTO | `percent !== 30` -> throw Error | Schema lưu giá trị thực tế | Cũ chưa nêu rõ | **CONTRACT_CORRECT** |
| **4** | **Database schema linh hoạt** lưu trữ tỷ lệ snapshot | Không áp dụng | DTO truyền dạng số nguyên 30 | Domain ánh xạ sang Decimal | `prepaymentPercent Decimal(5,2)` hỗ trợ mở rộng | `DATABASE.md:65` đã mô tả đúng | **CONTRACT_CORRECT** |
| **5** | **Tiền dịch vụ cộng thêm không nằm trong cơ sở tính cọc 30%** | Chỉ tính cọc trên giá sân | Quote chỉ nhận giờ sân | `quote.totalAmount` lấy từ `schedule.quote(court, starts, ends)` | Bảng giá sân riêng biệt với dịch vụ | `LEGAL-AND-PRIVACY.md:66` đã xác nhận | **CONTRACT_CORRECT** |
| **6** | **Hủy tại hoặc trước T-12h:** Hoàn 20% tiền sân, giữ 10% tiền phạt | Hiển thị chính sách hoàn tiền | DTO nhận yêu cầu hủy hợp lệ | `cancellation-policy.ts:39` tính phạt 10%, hoàn 20% từ cọc 30% | `BookingCancellationRequest` lưu quote | `PROJECT.md` cũ chỉ ghi phạt 10% chung chung | **CONTRACT_CORRECT** (Code) / **STALE_DOCUMENTATION** (Docs) |
| **7** | **Hủy trong vòng 12h trước giờ chơi:** Khách không được tự hủy | Giao diện khóa nút hủy khi vào cửa sổ 12h | Chặn ở `GuestCancellationController` | `isInLateCancelWindow` ném lỗi từ chối khách tự hủy | Lưu log từ chối | `RELEASE-REQUIREMENTS.md:8` đã ghi nhận | **CONTRACT_CORRECT** |
| **8** | **Hủy muộn do nhân viên xử lý:** Áp dụng mất cọc 30% | Staff portal có form hủy muộn | `staff-late-cancel.dto.ts` | `deposit-forfeiture.ts` tịch thu đúng 30% cọc | `forfeitedAmount = 30%` | Đã có tài liệu vận hành | **CONTRACT_CORRECT** |
| **9** | **NO_SHOW (vắng mặt):** Mất toàn bộ tiền cọc 30% | Không áp dụng | Sweep tự động chạy qua BullMQ | `mark-no-show.use-case.ts` gọi `applyDepositForfeitureTx` | Trạng thái chuyển `NO_SHOW` | Đã có trong `deposit-forfeiture.ts` | **CONTRACT_CORRECT** |
| **10** | **Xử lý đơn lịch sử đã trả 100%:** Hoàn tiền đúng tỷ lệ | Quản lý hoàn tiền lịch sử | Đọc snapshot từ DB | `deposit-forfeiture.ts:9` (paid100 -> hoàn 70% khi NO_SHOW/hủy muộn) | Bảo tồn snapshot 100.00 cũ | `DATABASE.md:69` đã mô tả | **CONTRACT_CORRECT** |
| **11** | **Check-in không trước giờ bắt đầu:** Giờ thực tế `>= startsAt` | Nút check-in hiển thị đếm ngược | Chặn ở Controller | `checkin-eligibility.ts:70` (`TOO_EARLY` nếu `now < startsAt`) | Lưu thời điểm `checkedInAt` | `DATABASE-DESIGN.md` đã mô tả | **CONTRACT_CORRECT** |
| **12** | **Được check-in muộn nhưng không kéo dài giờ kết thúc** | Thông báo giờ kết thúc cố định | Kiểm tra `now < endsAt` | `checkin-eligibility.ts:75` cho phép check-in đến trước `endsAt` | Slot `CourtOccupancy` bất biến | Đã có trong domain checkin | **CONTRACT_CORRECT** |
| **13** | **Tự động COMPLETED sau khi hết giờ (nếu đã check-in)** | Không áp dụng | BullMQ sweep `BOOKING_SETTLE_JOB` | `settle-eligible-bookings.use-case.ts:31` (`CHECKED_IN` -> `COMPLETED`) | Trạng thái `COMPLETED` | `WORKFLOWS.md` đã có state machine | **CONTRACT_CORRECT** |

> [!NOTE]
> Toàn bộ 13 quy tắc nghiệp vụ cốt lõi đều đạt trạng thái **`CONTRACT_CORRECT` trong mã nguồn backend và frontend**. Vấn đề duy nhất là sự chậm trễ trong việc cập nhật tài liệu Markdown (`STALE_DOCUMENTATION`).

---

## E. TEST COVERAGE & ENVIRONMENT GAPS (KHOẢNG TRỐNG KIỂM THỬ)

### 1. Phân tích hiện trạng các tầng kiểm thử

```
[ Unit Tests Frontend ]  --> 210 PASS (100% pass, có 3 warnings JSON import)
[ Unit Tests Backend ]   --> 410 PASS (100% pass trên Mock/In-memory)
[ Auth Contract / Sec ]  --> 142 PASS (HTTP Security & Validation)
[ Integration Tests ]    --> 51 SKIPPED (Bị chặn do thiếu disposable DB/Redis URL)
[ E2E Test Suite ]       --> BLOCKED (Chưa chạy vì nguy cơ restart container)
```

### 2. Chi tiết 51 Integration Tests bị bỏ qua (Skipped)
Các bài test này **đã được viết hoàn chỉnh, cực kỳ chi tiết và chất lượng cao**, nhưng bị đặt sau cờ điều kiện:
`const storageDescribe = databaseUrl && redisUrl ? describe : describe.skip;`

1. **`backend/test/booking.integration.spec.ts` (16 tests SKIP):**
   - Kiểm tra giao dịch nguyên tử (atomic transaction) lưu trữ `Booking`, `CourtOccupancy`, `PriceItems`, `StatusHistory` với deadline 300 giây.
   - Kiểm tra cơ chế Postgres Exclusion Constraint ngăn chặn triệt để đặt trùng lịch (double booking) ở tầng database.
   - Kiểm tra rollback toàn bộ giao dịch khi trigger database từ chối occupancy cuối cùng.
   - Kiểm tra cơ chế dọn dẹp giữ chỗ hết hạn (hold expiration) của BullMQ worker.
   - Kiểm tra chống trùng lặp request đồng thời bằng khóa idempotency phân tán.
2. **`backend/test/payments-coordinator.integration.spec.ts` (12 tests SKIP):**
   - Xác nhận booking khi nhận đủ tiền verified trước khi hết hạn hold.
   - Đảm bảo 2 tiến trình xác nhận song song chỉ có duy nhất 1 lần chuyển trạng thái `CONFIRMED`.
   - Xử lý tiền đến muộn sau khi hold đã hết hạn (tạo `obligation`, không hồi sinh booking rác).
   - Kiểm tra webhook payOS lặp (duplicate webhook) chỉ sinh đúng 1 receipt duy nhất.
   - Kiểm tra thanh toán tiền mặt tại quầy (CASH) theo dư nợ thực tế và replay an toàn.
   - Kiểm tra quy trình phê duyệt hoàn tiền 4 mắt (four-eyes principle).
3. **`backend/test/booking-deposit.integration.spec.ts` (16 tests SKIP):**
   - Từ chối chạy trên database đã có dữ liệu để tránh phá hoại.
   - Nâng cấp snapshot 100% lịch sử mà không ghi đè dữ liệu cũ.
   - Kiểm tra cọc 30% cho khách vãng lai và thành viên trên database PostgreSQL thật.
4. **`backend/src/modules/auth/auth-storage.integration.spec.ts` (7 tests SKIP):**
   - Kiểm tra lưu trữ refresh token, thu hồi token, rate limit và session trong Redis thật.

### 3. Khoảng trống môi trường và điều kiện mở khóa
- **PostgreSQL Disposable Instance:** Cần một database test độc lập (ví dụ tên `booking_test` hoặc `booking_deposit_test` chạy trên cổng local riêng biệt) để cấp các biến:
  - `BOOKING_DATABASE_TEST_URL`
  - `BOOKING_DEPOSIT_DATABASE_TEST_URL`
  - `AUTH_SECURITY_DATABASE_TEST_URL`
- **Redis Disposable Instance:** Cần một Redis test độc lập để cấp:
  - `BOOKING_REDIS_TEST_URL`
  - `AUTH_SECURITY_REDIS_TEST_URL`
- **Provider Mocks:** Toàn bộ logic cổng thanh toán payOS đã có Mock SDK (`PayOS` instance trong test) và Mock webhook generator; **hoàn toàn không cần tài khoản payOS production thật** để chạy kiểm thử tích hợp.

---

## F. P0 / P1 / P2 REMEDIATION PLAN (KẾ HOẠCH KHẮC PHỤC CHI TIẾT)

Kế hoạch này được thiết kế để một **Coding Agent** có thể tiếp nhận và thực thi tuần tự, không cần hỏi lại hay lập kế hoạch vòng hai.

### DANH SÁCH TASK KHẮC PHỤC

```
[ P0: Tính đúng đắn nghiệp vụ & Trạng thái cốt lõi ]
├── TASK-P0-01: Đồng bộ tài liệu đặc tả với chính sách cọc 30% & hủy T-12h
└── TASK-P0-02: Khắc phục lỗi hiển thị đồng thời Error & Empty trên trang chủ

[ P1: Trải nghiệm người dùng, Responsive & Thương hiệu ]
├── TASK-P1-01: Sửa tràn ngang (overflow) Header Legal trên mobile (320px - 484px)
├── TASK-P1-02: Sửa co cụm và cắt xén input Form Support trên mobile (< 640px)
├── TASK-P1-03: Thống nhất thương hiệu hiển thị "SMASH ARENA" trên toàn UI
└── TASK-P1-04: Chuẩn hóa padding và layout giao diện trang Account

[ P2: Tooling, Cấu hình CI/CD & Mở khóa kiểm thử ]
├── TASK-P2-01: Khắc phục cảnh báo Jest JSON import attributes
├── TASK-P2-02: Chuẩn hóa biến môi trường build frontend trong CI/local
├── TASK-P2-03: Tách rời hook hủy diệt pretest:e2e và thiết lập bảo vệ môi trường
└── TASK-P2-04: Thiết lập kịch bản chạy an toàn 51 integration tests với Docker
```

---

### CHI TIẾT TỪNG TASK TRIỂN KHAI

#### TASK-P0-01: Đồng bộ tài liệu đặc tả với chính sách cọc 30% & hủy T-12h
- **Mức độ ưu tiên:** P0 (Docs Alignment)
- **Files liên quan:**
  - `docs/PROJECT.md`
  - `docs/WORKFLOWS.md`
  - `docs/ARCHITECTURE.md`
  - `docs/DATABASE-DESIGN.md`
- **Nguyên nhân gốc:** Tài liệu cũ ghi nhận chính sách nháp ban đầu (Member được chọn 30%/100%, Guest trả 100%), chưa cập nhật theo quyết định phê duyệt chính thức ngày 26/10/2026.
- **Nội dung sửa đổi:**
  - Cập nhật dòng 5 của `docs/PROJECT.md`: Khẳng định đặt cọc bắt buộc **30% tiền thuê sân** cho cả Member và Guest; cấm trả trước 100% khi tạo mới. Phạt hủy 10% tại/trước T-12h (hoàn 20%); trong vòng 12h trước giờ bắt đầu mất toàn bộ cọc 30%. Giữ chỗ 5 phút (300 giây).
  - Cập nhật mục 2 dòng 10 của `docs/WORKFLOWS.md`: Đồng bộ quy tắc cọc 30% và state machine cho hủy T-12h / NO_SHOW.
  - Cập nhật `docs/ARCHITECTURE.md` và `docs/DATABASE-DESIGN.md` tại các bảng mô tả tiền cọc.
- **Dependencies:** Không.
- **Rủi ro regression:** Không ảnh hưởng mã nguồn.
- **Acceptance Criteria:** Toàn bộ tài liệu trong `docs/` sử dụng con số nhất quán: cọc 30%, giữ chỗ 5 phút, phạt hủy T-12h (10% phạt, 20% hoàn), mất cọc 30% khi NO_SHOW.

---

#### TASK-P0-02: Khắc phục lỗi hiển thị đồng thời Error & Empty trên trang chủ
- **Mức độ ưu tiên:** P0 (Core UX Correctness)
- **Files liên quan:**
  - `frontend/app/page.tsx`
  - `frontend/features/courts/components/court-catalog-view.tsx`
  - `frontend/components/arena/arena-load-status.tsx`
- **Nguyên nhân gốc:** Trong `frontend/app/page.tsx`, `<CourtCatalogView courts={courts} />` được render vô điều kiện ngay cả khi `error` hoặc `loading` đang active, làm kích hoạt thông điệp "Không có sân phù hợp..." và các tab đếm `(0)` cùng lúc với alert báo lỗi kết nối.
- **Nội dung sửa đổi:**
  - Trong `frontend/app/page.tsx`:
    - Nếu `loading`: Hiển thị placeholder/skeleton đang tải dữ liệu.
    - Nếu `error && !loading`: Chỉ hiển thị banner báo lỗi mạng cùng nút "Thử lại"; **KHÔNG render `CourtCatalogView`**.
    - Nếu `!loading && !error && courts.length === 0`: Hiển thị thông báo trạng thái rỗng chân thật ("Hiện tại chưa có sân nào được mở phục vụ.").
    - Nếu `!loading && !error && courts.length > 0`: Mới render `<CourtCatalogView courts={courts} />`.
  - Trong `court-catalog-view.tsx`: Đảm bảo thông báo "Không có sân phù hợp với bộ lọc hiện tại." chỉ xuất hiện khi danh mục gốc có sân nhưng bộ lọc người dùng chọn không có kết quả.
- **Dependencies:** Không.
- **Rủi ro regression:** Rất thấp.
- **Test yêu cầu:** `frontend/__tests__/frontend-home-appearance.spec.tsx` bổ sung test case: Khi API fail, kiểm tra DOM chỉ có alert lỗi, không có text `(0)` hay "Không có sân phù hợp".
- **Definition of Done (DoD):** Khi ngắt kết nối backend, mở trang chủ chỉ thấy thông báo lỗi và nút Retry, không xuất hiện filter tabs `(0)` hay dòng báo rỗng.

---

#### TASK-P1-01: Sửa tràn ngang (overflow) Header Legal trên mobile (320px - 484px)
- **Mức độ ưu tiên:** P1 (Mobile Responsive)
- **Files liên quan:**
  - `frontend/features/legal/components/legal-page-shell.tsx`
  - `frontend/features/legal/components/legal.module.css`
- **Nguyên nhân gốc:** Header dùng inline styles với `display: flex; justify-content: space-between;` không wrap, không media query khiến độ rộng tối thiểu vượt quá 500px, đẩy nút "Đặt sân ngay" tràn khỏi màn hình trên mobile.
- **Nội dung sửa đổi:**
  - Chuyển toàn bộ inline styles của `<header>` và các div con sang CSS module classes trong `legal.module.css`:
    ```css
    .header {
      border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.08));
      padding: 0.875rem 1rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem 1rem;
      background-color: var(--surface-card, rgba(17, 24, 39, 0.85));
    }
    .brandNavGroup {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem 1.25rem;
    }
    .navList {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 0.875rem;
      font-size: 0.875rem;
    }
    ```
  - Thay text link trang chủ từ `← BookingManagement` thành `← SMASH ARENA`.
  - Giữ nguyên hiển thị desktop (nằm thẳng hàng 1 hàng) nhưng cho phép tự động wrap thành 2 tầng mượt mà trên mobile mà không gây tràn ngang.
- **Dependencies:** Không.
- **Rủi ro regression:** Không làm ảnh hưởng giao diện desktop.
- **Test yêu cầu:** Kiểm tra trên các viewport: `320px`, `375px`, `390px`, `484px`. Đo `document.documentElement.scrollWidth <= window.innerWidth`.

---

#### TASK-P1-02: Sửa co cụm và cắt xén input Form Support trên mobile (< 640px)
- **Mức độ ưu tiên:** P1 (Mobile Usability)
- **Files liên quan:**
  - `frontend/features/support/components/support-case-form.tsx`
  - `frontend/features/support/components/support.module.css`
- **Nguyên nhân gốc:** Khối nhập Email và Số điện thoại sử dụng inline style `display: grid; gridTemplateColumns: '1fr 1fr'; gap: '1rem';` cố định trên mọi kích thước màn hình.
- **Nội dung sửa đổi:**
  - Xóa inline style, gán class `.contactGrid` vào `support.module.css`:
    ```css
    .contactGrid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    @media (min-width: 640px) {
      .contactGrid {
        grid-template-columns: 1fr 1fr;
      }
    }
    ```
  - Bổ sung `min-width: 0; width: 100%; box-sizing: border-box;` cho `.input` trong `support.module.css`.
- **Dependencies:** Không.
- **Test yêu cầu:** Kiểm tra form support trên màn hình 390px và 484px, ô nhập số điện thoại không bị co cụm hay cắt mép; chuyển sang 1 cột trên mobile và 2 cột từ 640px trở lên.

---

#### TASK-P1-03: Thống nhất thương hiệu hiển thị "SMASH ARENA" trên toàn UI
- **Mức độ ưu tiên:** P1 (Brand Consistency)
- **Files liên quan:**
  - `frontend/features/legal/components/legal-page-shell.tsx`
  - `frontend/features/legal/components/legal-footer.tsx`
  - `frontend/features/cookie-consent/components/cookie-banner.tsx`
- **Nội dung sửa đổi:**
  - Đổi tên hiển thị trong `legal-page-shell.tsx`: `← SMASH ARENA`.
  - Đổi thương hiệu trong `legal-footer.tsx`:
    - `BookingManagement Sports Arena` -> `SMASH ARENA - Pickleball Club`.
    - `© {currentYear} BookingManagement` -> `© {currentYear} SMASH ARENA`.
  - Đổi text trong `cookie-banner.tsx`: `BookingManagement sử dụng các cookie...` -> `SMASH ARENA sử dụng các cookie...`.
- **Dependencies:** Không.
- **Test yêu cầu:** `npm run test:frontend:ui` và `legal-pages-rendering.spec.tsx`.

---

#### TASK-P1-04: Chuẩn hóa padding và layout giao diện trang Account
- **Mức độ ưu tiên:** P1 (Account Mobile Usability)
- **Files liên quan:**
  - `frontend/components/account/account-shell.module.css`
  - `frontend/app/account/layout.tsx`
- **Nguyên nhân gốc:** `.page` có `padding: 32px 0 64px;` làm nội dung dính sát lề trái 0px trên mobile; `layout.tsx` thiếu container styling đồng bộ giữa dark header và light body.
- **Nội dung sửa đổi:**
  - Trong `account-shell.module.css`: Cập nhật padding thành `padding: 2rem 1rem 4rem;` (có 16px an toàn ở 2 bên mép mobile).
  - Thêm `box-sizing: border-box; width: 100%; margin: 0 auto;`.
  - Trong `account/layout.tsx`: Thêm wrapper bao bọc với background nền êm dịu, loại bỏ cảm giác cắt khúc giữa header thể thao tối và nội dung tài khoản.
- **Test yêu cầu:** `frontend/__tests__/frontend-account-rendering.spec.tsx`.

---

#### TASK-P2-01: Khắc phục cảnh báo Jest JSON import attributes
- **Mức độ ưu tiên:** P2 (Tooling / Deprecation)
- **Files liên quan:**
  - `frontend/__tests__/legal-pages-rendering.spec.tsx:8-10`
- **Nguyên nhân gốc:** Import JSON trực tiếp bằng cú pháp ES module cũ không có import attributes trong môi trường Node v24.
- **Nội dung sửa đổi:**
  - Chuyển sang đọc qua `fs.readFileSync(new URL('../content/legal/...', import.meta.url), 'utf-8')` kết hợp `JSON.parse()`, hoặc cú pháp `import ... with { type: 'json' }` phù hợp với cấu hình tsconfig/jest.
- **Test yêu cầu:** Chạy `npx jest frontend/__tests__/legal-pages-rendering.spec.tsx` không còn in `ExperimentalWarning` ra terminal.

---

#### TASK-P2-02: Chuẩn hóa biến môi trường build frontend trong CI/local
- **Mức độ ưu tiên:** P2 (Build Reliability)
- **Files liên quan:**
  - `package.json`
  - `frontend/constants/public-origin.mjs`
  - `docs/PIPELINES.md`
- **Nguyên nhân gốc:** Lệnh `npm run build:web` kích hoạt `next build` (chạy ngầm ở chế độ production) nhưng thiếu biến môi trường HTTPS URL trong môi trường máy dev, dẫn đến vấp guard `resolvePublicApiOrigin`.
- **Nội dung sửa đổi:**
  - Trong `package.json`: Cập nhật script `build:web`:
    `"build:web": "next build frontend"` giữ nguyên cho production, bổ sung script kiểm thử:
    `"test:build:web": "cross-env NEXT_PUBLIC_API_URL=https://api.staging.smasharena.vn next build frontend"`.
  - Bổ sung tài liệu trong `docs/PIPELINES.md` giải thích rõ guard an ninh này để dev không bị bối rối.

---

#### TASK-P2-03: Tách rời hook hủy diệt pretest:e2e và thiết lập bảo vệ môi trường
- **Mức độ ưu tiên:** P2 (Environment Safety)
- **Files liên quan:**
  - `package.json:28`
  - `docs/PIPELINES.md`
- **Nguyên nhân gốc:** `pretest:e2e` tự động chạy `npm run db:test:restart` gây dừng và xóa cưỡng bức container `test-database` và `test-redis`.
- **Nội dung sửa đổi:**
  - Đổi tên `pretest:e2e` trong `package.json` thành script thủ công có chủ đích: `"e2e:env:prep": "npm run db:test:restart"`.
  - `test:e2e` chỉ thực thi chạy Jest trên môi trường đã sẵn sàng, không tự động hủy diệt container.
  - Ghi chú cảnh báo an toàn trong `docs/PIPELINES.md`.

---

#### TASK-P2-04: Thiết lập kịch bản chạy an toàn 51 integration tests với Docker
- **Mức độ ưu tiên:** P2 (Verification Completeness)
- **Files liên quan:**
  - `infra/docker-compose.yml`
  - `docs/PIPELINES.md`
- **Nội dung:**
  - Xây dựng hướng dẫn từng bước để lập trình viên khởi động container test biệt lập trên cổng không xung đột (ví dụ DB test cổng 5433, Redis test cổng 6380):
    ```bash
    # Khởi động container test độc lập
    docker compose --env-file backend/.env.test -f infra/docker-compose.yml up -d test-database test-redis
    # Chạy migration trên DB test
    npm run prisma:test:deploy
    # Chạy 51 tests tích hợp
    npm run test:booking:integration
    npm run test:payments:integration
    npm run test:auth:storage
    npm run test:booking:deposit:integration
    ```
  - Cung cấp checklist kiểm tra an toàn trước khi chạy.

---

## G. ACCEPTANCE MATRIX (MA TRẬN NGHIỆM THU TỔNG THỂ)

| Luồng chức năng (User Flow) | Hành vi kỳ vọng (Expected Behavior) | Test Suite kiểm chứng | Bằng chứng bắt buộc | Trạng thái hiện tại | Tiêu chí chấp nhận (Acceptance Criteria) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FL-01: Public Home Loading** | Khi API offline, hiện Alert lỗi mạng + nút Retry; KHÔNG hiện danh mục rỗng hay tab (0) | `frontend-home-appearance.spec.tsx` | DOM snapshot không có text `(0)` hay "Không có sân phù hợp" khi lỗi mạng | `NEEDS_REMEDIATION` (Task P0-02) | Phân tách rạch ròi Error State và Empty State. Bấm Retry kích hoạt fetch lại |
| **FL-02: Mobile Legal Browsing** | Header và nội dung co giãn mượt mà trên màn hình từ 320px đến 484px, không tràn thanh cuộn ngang | Playwright / DevTools screenshot tại 320/375/390/484px | `scrollWidth === innerWidth` trên toàn bộ các trang pháp lý | `NEEDS_REMEDIATION` (Task P1-01) | Không phát sinh horizontal scrollbar. Nút "Đặt sân ngay" hiển thị trọn vẹn |
| **FL-03: Support Form Submission** | Form hiển thị 1 cột trên mobile (<640px) và 2 cột trên desktop. Input điện thoại không bị co cụm | DevTools resize tại 390px và 1280px | Screenshot mobile form không bị clipping lề phải | `NEEDS_REMEDIATION` (Task P1-02) | Input email & phone chiếm 100% chiều rộng mỗi hàng trên mobile, không tràn lề |
| **FL-04: Brand Consistency** | Toàn bộ header, footer, cookie banner, account hiển thị thương hiệu "SMASH ARENA" | Visual Inspection & grep check | Grep mã nguồn frontend không thấy "BookingManagement" hiển thị cho user | `NEEDS_REMEDIATION` (Task P1-03) | 100% text giao diện dùng "SMASH ARENA". "BookingManagement" chỉ giữ ở tên repo/file kỹ thuật |
| **FL-05: Account Layout Spacing** | Trang cá nhân có padding lề tối thiểu 16px trên mobile, giao diện chuyển tiếp êm ái | Visual Inspection & rendering spec | Screenshot mobile account có lề trái/phải rõ ràng | `NEEDS_REMEDIATION` (Task P1-04) | Nội dung không dính sát viền kính màn hình. Có nút kiểm tra lại phiên khi lỗi mạng |
| **FL-06: Member / Guest 30% Deposit** | Mọi lượt đặt sân mới chỉ chấp nhận đặt cọc đúng 30% tiền thuê sân. Chặn 100% | `create-hold.use-case.spec.ts`, `booking.integration.spec.ts` | HTTP 400 khi gửi `prepaymentPercent: 100`. Database ghi `prepaymentPercent = 30.00` | `IMPLEMENTED` / `VERIFIED_UNIT` (Cần verify integration) | Tỷ lệ cọc bắt buộc 30%, tính toán làm tròn VND đúng chuẩn HALF_UP |
| **FL-07: Cancellation T-12h Boundary** | Hủy tại/trước T-12h phạt 10%, hoàn 20%. Trong vòng 12h: khách bị khóa hủy, staff hủy mất cọc 30% | `cancellation-policy.spec.ts`, `deposit-forfeiture.spec.ts` | Test asserts: T-13h -> refund 20%; T-11h -> reject guest, staff cancel -> refund 0% (forfeit 30%) | `IMPLEMENTED` / `VERIFIED_UNIT` | Logic tính toán phí và hoàn tiền khớp 100% với chính sách chốt 26/10/2026 |
| **FL-08: Check-in & Auto-Completion** | Chỉ check-in từ startsAt đến endsAt khi đã trả đủ 100% tiền sân. Sau endsAt tự chuyển COMPLETED | `checkin-eligibility.spec.ts`, `settle-eligible-bookings.use-case.ts` | Test asserts: `now < startsAt` -> TOO_EARLY; `now >= endsAt` -> COMPLETED / NO_SHOW sweep | `IMPLEMENTED` / `VERIFIED_UNIT` | Không check-in trước giờ. Đã check-in tự động hoàn tất. Vắng mặt tự động đánh NO_SHOW |

---

## H. SAFE VERIFICATION RUNBOOK (QUY TRÌNH KIỂM CHỨNG AN TOÀN)

Quy trình này áp dụng cho Coding Agent sau khi hoàn tất sửa code, đảm bảo kiểm thử an toàn, không rò rỉ secret, không gây tác dụng phụ phá hủy container:

### Bước 1: Kiểm tra cú pháp và Format (Static Checks)
Chạy kiểm tra tĩnh không có side-effect:
```powershell
# 1. Lint toàn bộ dự án
npm run lint

# 2. Kiểm tra an ninh mã nguồn
node tools/security-source-check.mjs

# 3. Kiểm tra định dạng whitespace git
git diff --check
```
*Tiêu chí đạt:* Exit code 0, không có syntax error hoặc whitespace warning.

### Bước 2: Chạy Unit Tests Frontend & Backend (In-Memory Safe)
Chạy bộ kiểm thử đơn vị độc lập không cần database:
```powershell
# 1. Chạy toàn bộ unit test backend
npm run test:backend

# 2. Chạy toàn bộ unit test frontend
npm run test:frontend

# 3. Chạy kiểm tra contract auth
npm run test:auth:contract
```
*Tiêu chí đạt:* 410 backend unit tests PASS; 210 frontend unit tests PASS; không còn warning JSON import.

### Bước 3: Kiểm tra Build Frontend & Backend
Xác nhận mã nguồn biên dịch thành công mà không phụ thuộc hạ tầng thật:
```powershell
# 1. Build backend (Prisma generate + Nest build)
npm run build

# 2. Build frontend với biến môi trường HTTPS giả lập an toàn
$env:NEXT_PUBLIC_API_URL="https://api.staging.smasharena.vn"
npm run build:web
Remove-Item Env:\NEXT_PUBLIC_API_URL
```
*Tiêu chí đạt:* Cả 2 lệnh build đều exit code 0. Next.js sinh đầy đủ 22 static/SSR pages.

### Bước 4: Kiểm chứng Giao diện & Đo lường Viewport (Browser Verification)
Sử dụng Playwright hoặc Chrome DevTools để kiểm tra trực quan:
1. Khởi động frontend: `npm run web:dev` (chạy trên cổng `http://localhost:4001`).
2. Mở trình duyệt ẩn danh, điều chỉnh các viewport:
   - `320 x 568` (iPhone SE 1)
   - `375 x 667` (iPhone 8)
   - `390 x 844` (iPhone 12/13/14)
   - `484 x 844` (Android chuẩn)
   - `768 x 1024` (Tablet)
   - `1280 x 800` (Desktop)
3. Đo lường trên Console:
   ```javascript
   console.log('Scroll width:', document.documentElement.scrollWidth, 'Inner width:', window.innerWidth);
   console.assert(document.documentElement.scrollWidth <= window.innerWidth, 'OVERFLOW DETECTED!');
   ```
4. Kiểm tra các trang: `/`, `/privacy`, `/terms`, `/cookies`, `/refund-policy`, `/support`, `/account`.
*Tiêu chí đạt:* Không có bất kỳ trang nào bị `scrollWidth > innerWidth`.

### Bước 5: Mở khóa Integration Tests trên Disposable Containers (Tùy chọn nâng cao)
Chỉ thực hiện khi có môi trường Docker an toàn:
1. Tạo container test riêng biệt:
   ```powershell
   docker compose --env-file backend/.env.test -f infra/docker-compose.yml up -d test-database test-redis
   ```
2. Chạy migration trên DB test:
   ```powershell
   npm run prisma:test:deploy
   ```
3. Chạy từng suite tích hợp:
   ```powershell
   $env:BOOKING_DATABASE_TEST_URL="postgresql://test_user:test_password@localhost:5433/booking_test"
   $env:BOOKING_REDIS_TEST_URL="redis://localhost:6380"
   npm run test:booking:integration
   npm run test:payments:integration
   Remove-Item Env:\BOOKING_DATABASE_TEST_URL
   Remove-Item Env:\BOOKING_REDIS_TEST_URL
   ```
*Tiêu chí đạt:* 51 tests tích hợp chuyển từ `SKIP` sang `PASS`.

---

## I. COMMIT / MERGE / RELEASE GATES (TIÊU CHÍ PHÊ DUYỆT TỪNG MỨC)

```
[ GATE A: COMMIT TO DEV ]  ===> ĐỦ ĐIỀU KIỆN (Sau khi thực hiện P0 + P1)
[ GATE B: MERGE TO MAIN ]  ===> CHƯA ĐỦ ĐIỀU KIỆN (Cần giải quyết 51 tests skip)
[ GATE C: PRODUCTION ]     ===> CHƯA ĐỦ ĐIỀU KIỆN (Cần payOS, SMTP & DevOps)
```

### 1. Gate A — Sẵn sàng Commit lên nhánh phát triển (Development Branch)
- [x] Không có lỗi logic gây sai lệch tiền cọc (Backend & Frontend cọc bắt buộc 30%).
- [x] Không có thay đổi schema database phá vỡ dữ liệu lịch sử.
- [ ] Đã sửa lỗi responsive tràn màn hình F1 (P1-01, P1-02).
- [ ] Đã sửa lỗi hiển thị lẫn lộn Error/Empty state trên trang chủ F3 (P0-02).
- [ ] Đã thống nhất thương hiệu "SMASH ARENA" và lề trang Account F4 (P1-03, P1-04).
- [ ] Đã cập nhật tài liệu `docs/PROJECT.md` và `docs/WORKFLOWS.md` (P0-01).
- [x] `npm run lint` và `node tools/security-source-check.mjs` exit code 0.
- [x] Unit test backend và frontend 100% PASS.
- **Đánh giá Gate A:** **SẼ ĐẠT ĐIỀU KIỆN NGAY KHI HOÀN TẤT CÁC TASK P0 VÀ P1.**

### 2. Gate B — Sẵn sàng Merge lên nhánh chính (Main Branch / Staging Stable)
- [ ] Đạt toàn bộ tiêu chí của Gate A.
- [ ] Khởi động disposable PostgreSQL và Redis test để chạy toàn bộ 51 integration tests đạt trạng thái **100% PASS** (không còn suite nào bị SKIP).
- [ ] Kiểm tra tương thích Node v24.21.0 theo đúng `.nvmrc`.
- [ ] Không còn bất kỳ cảnh báo Jest nào (P2-01).
- [ ] Frontend build pass trên môi trường Staging với HTTPS origin thật.
- **Đánh giá Gate B:** **CHƯA ĐẠT ĐIỀU KIỆN** (Cần mở khóa tầng kiểm thử tích hợp).

### 3. Gate C — Sẵn sàng Triển khai Phát hành Thực tế (Production Release)
- [ ] Đạt toàn bộ tiêu chí của Gate B.
- [ ] Đăng ký tài khoản Merchant payOS chính thức, cấu hình Webhook URL HTTPS an toàn và xác minh chữ ký HMAC webhook production.
- [ ] Cấu hình dịch vụ gửi email SMTP production (thay thế Mailpit).
- [ ] Hoàn thiện hạ tầng CI/CD deployment pipeline, health check endpoint và kịch bản rollback tự động.
- [ ] Kiểm thử tải (load testing) và kiểm thử xâm nhập bảo mật (penetration testing).
- [ ] Phê duyệt văn bản pháp lý chính sách người dùng từ luật sư.
- **Đánh giá Gate C:** **CHƯA ĐẠT ĐIỀU KIỆN** (Phụ thuộc vào hạ tầng vận hành và đối tác thứ ba).

---

## J. HANDOFF TO IMPLEMENTATION AGENT (HƯỚNG DẪN BÀN GIAO THỰC THI)

Dành riêng cho **Coding Implementation Agent**: Bạn có thể thực hiện công việc sửa chữa trực tiếp theo đúng thứ tự phụ thuộc dưới đây mà không cần yêu cầu lập lại kế hoạch:

### Thứ tự thực thi đề xuất (Execution Order)

1. **Bước 1 (Đồng bộ tài liệu - P0-01):**
   - Mở `docs/PROJECT.md` dòng 5: Cập nhật quy tắc đặt cọc 30% cho cả Member và Guest; cấm 100% mới; phạt 10% tại T-12h; mất cọc 30% trong 12h/NO_SHOW; giữ chỗ 5 phút.
   - Mở `docs/WORKFLOWS.md` dòng 10: Cập nhật tương tự.

2. **Bước 2 (Khắc phục lỗi trang chủ - P0-02):**
   - Mở `frontend/app/page.tsx`: Điều chỉnh điều kiện render. Khi `error` hoặc `loading`, tuyệt đối không render `<CourtCatalogView courts={courts} />`. Chỉ hiển thị banner lỗi + nút Thử lại.

3. **Bước 3 (Sửa lỗi CSS Responsive Mobile - P1-01 & P1-02):**
   - Mở `frontend/features/legal/components/legal-page-shell.tsx`: Bỏ inline style của header, chuyển sang dùng class trong `legal.module.css` có `flex-wrap: wrap`. Thay text `← BookingManagement` thành `← SMASH ARENA`.
   - Mở `frontend/features/support/components/support-case-form.tsx`: Bỏ inline style `gridTemplateColumns: '1fr 1fr'`, chuyển sang class `.contactGrid` trong `support.module.css` với media query mobile 1 cột, desktop 2 cột.

4. **Bước 4 (Thống nhất Thương hiệu & Bố cục Account - P1-03 & P1-04):**
   - Mở `frontend/features/legal/components/legal-footer.tsx`: Đổi text thương hiệu thành `SMASH ARENA - Pickleball Club`.
   - Mở `frontend/features/cookie-consent/components/cookie-banner.tsx`: Đổi text thành `SMASH ARENA`.
   - Mở `frontend/components/account/account-shell.module.css`: Thêm padding ngang `padding: 2rem 1rem 4rem;`.

5. **Bước 5 (Dọn dẹp Cảnh báo & Tooling - P2-01 & P2-02):**
   - Sửa import JSON trong `frontend/__tests__/legal-pages-rendering.spec.tsx`.
   - Cập nhật tài liệu biến môi trường build trong `docs/PIPELINES.md`.

6. **Bước 6 (Kiểm chứng cuối):**
   - Chạy `npm run lint` -> PASS.
   - Chạy `npm test` -> PASS (không có warning).
   - Kiểm tra `scrollWidth` trên mobile -> PASS.

---
*Tài liệu được lập bởi Senior QA Reviewer & Software Architect — Antigravity CLI.*
