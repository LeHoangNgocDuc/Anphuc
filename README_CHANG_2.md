# AN PHÚC EDUCATION - LMS mới - CHẶNG 2/4

**Bản Chặng 2 tiếp nối nguyên bộ Chặng 1.** Đây là website mới dùng Supabase, **KHÔNG thay đổi website V4.32 đang chạy với Google Sheets**. Giữ toàn bộ tệp trong ZIP và cấu trúc thư mục khi đưa lên GitHub/Vercel.

## 1. Đã bổ sung

| File | Mục đích |
|---|---|
| `js/config.js` | Hai cấu hình Supabase cho frontend, thông tin trung tâm, nhận biết chế độ Demo / Supabase; kiểm tra không dùng service-role/secret key. |
| `js/db.js` | API truy cập dữ liệu thống nhất, LocalDemoAdapter (IndexedDB), SupabaseAdapter (SDK v2, Auth + RLS), import theo lô 300. |
| `js/excel-parser.js` | Chuẩn hóa Excel và xác thực MC/TF/SA, bỏ `LA`, thống kê C1/C2/C3 theo khối; cho phép hủy, báo lỗi theo dòng. |
| `js/excel-worker.js` | Giải mã XLS/XLSX bằng Worker, tránh khóa luồng giao diện khi đọc workbook lớn. |
| `stage2-test.html`, `js/stage2-test.js` | **Trang kiểm thử Chặng 2**: trạng thái Demo/Supabase, số HS/câu hỏi, đọc/soát Excel, xem lỗi, nhập dữ liệu sau xác nhận. |
| `tests/test-stage2.mjs` | Bài kiểm thử logic và dữ liệu giả lập 6.300 câu hỏi. |

Các file của Chặng 1 (`index.html`, `styles/*`, `supabase_schema.sql`, logo, chữ ký, `vercel.json`) đều được giữ.

## 2. Chạy DEMO - không cần Supabase

Mở `js/config.js`. Để TRỐNG cả hai cấu hình:

```js
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
```

Tải cả thư mục lên GitHub, deploy Vercel (Framework: Other; không build). Sau đó mở:

- `https://TEN-DOMAIN-VERCEL/stage2-test.html`

Để chạy trên máy, khởi động local web server ngay trong thư mục gốc (cần cài Python):

```sh
python -m http.server 8000
```

Truy cập `http://localhost:8000/stage2-test.html`. **Không mở trực tiếp `file:///.../stage2-test.html`**, vì các ES Modules thường bị chặn bởi chính sách CORS của trình duyệt.

Demo tự tạo 3 học sinh hư cấu và 9 câu mẫu, lưu lại trong **IndexedDB** (hoặc localStorage nếu không có IndexedDB). Có nút đặt lại dữ liệu mẫu. Không dùng chế độ Demo công khai để lưu dữ liệu cá nhân thật.

Truy cập trang `index.html` vẫn chỉ là khung giao diện Chặng 1. Cổng học sinh, giáo viên, phụ huynh hoàn chỉnh sẽ được nối vào JS ở Chặng 3/4; không có chuyện các nút chấm điểm đã hoạt động ở Chặng 2.

## 3. Kết nối Supabase thật

1. Tạo Supabase project **MỚI**. Chạy file `supabase_schema.sql` có sẵn trong ZIP bằng SQL Editor (đã giao ở Chặng 1).
2. Mở `js/config.js`, điền:

```js
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_xxxxxxxxx';
```

Có thể dùng `anon`/publishable key của project. **TUYỆT ĐỐI không** nhập `service_role`, `sb_secret_...`, password quản trị, token ngân hàng hoặc private API key vào JavaScript/frontend.

3. Tạo tài khoản giáo viên bằng Supabase Auth -> Users (email/password).
4. Gán UUID tài khoản giáo viên vào `staff_roles` trong SQL Editor bằng tài khoản quản trị:

```sql
insert into public.staff_roles(user_id, role)
values ('UUID_GIAO_VIEN_THAT', 'admin');
```

5. Cài provider SMS phù hợp cho Supabase Auth nếu muốn OTP phụ huynh thật. OTP có thể phát sinh chi phí nhà cung cấp SMS. Thiết lập giới hạn gửi, CAPTCHA và quy tắc chống lạm dụng. **Không thể xem thông tin học sinh chỉ bằng việc nhập số điện thoại nếu chưa xác thực OTP.** Số điện thoại trong Supabase Auth sẽ đối chiếu với `students.parent_phone` thông qua RLS.
6. Deploy lên Vercel. Mở `/stage2-test.html`, đăng nhập giáo viên rồi thử file Excel. Nếu chưa đăng nhập đúng quyền, thao tác ghi bị từ chối.

**Lưu ý:** Nếu đã mở SQL Editor chạy schema ở Chặng 1 thì KHÔNG cần chạy lặp lại để test parser. Phần đưa dữ liệu Google Sheets cũ sang Supabase chưa triển khai.

## 4. Chuẩn file Excel được hỗ trợ

Tên file dự kiến: `DatabaseNGANHANGCAUHOI.xlsx`. Nhận dạng các sheet:

- `QuestionBank`, `ToanTHCS`, `ToanTHPT`: `ID question` hoặc `ID`, `Type`, `Level`, `Grade`, `Subject`, `Chapter`, `Topic`, `Question`, `Option 1`..`Option 4`, `Correct answer`, `Explain` (và `ImageURL` nếu có).
- `Student_List`: `StudentID`, `FullName`, `Class`, `Phone`.

Tên cột có thể có dấu/không dấu và sai khác khoảng trắng. Dòng tiêu đề được tìm trong 18 hàng đầu.

- Bỏ hoàn toàn `Type = LA`.
- **C1:** `MC` Nhận biết / Thông hiểu.
- **C2:** tất cả `TF` và `MC` Vận dụng.
- **C3:** tất cả `SA` và `MC` Vận dụng cao.
- `MC`: đáp án phải có đủ 4 phương án và khớp A/B/C/D, chỉ số 1..4 hoặc chính nội dung phương án.
- `TF`: 4 ý với đáp án dạng `DDSS`, `ĐSĐS`, `TFFT`, `1010` hoặc 4 giá trị ngăn cách bằng dấu `,;|/`.
- `SA`: giữ đáp án dạng chuỗi, chuẩn hóa `,` thành `.` để kiểm tra số ở Chặng 3.
- Mã ID trùng: giữ bản ghi đầu tiên và cảnh báo; dòng không hợp lệ bị loại khỏi danh sách ghi.
- Thiếu `StudentID` bị loại vì không thể gắn đúng học sinh cũ; học sinh trùng tên vẫn được tách bằng `StudentID`.
- SĐT hỗ trợ `84325256302` thành `0325256302` và `357055794` thành `0357055794`.
- Mặc định không xóa dữ liệu cũ khi cập nhật ngân hàng câu hỏi bằng file mới. Các bản ghi câu hỏi không nằm trong file Excel mới vẫn còn trong DB để tránh xóa nhầm.

**Cần lưu ý:** Nếu file Excel thực tế có định dạng khác hoặc chứa công thức đáp án không hỗ trợ, trang kiểm tra sẽ báo sheet/dòng cụ thể để xử lý, không suy đoán câu trả lời.

## 5. Sử dụng trình đọc / importer

Tại `/stage2-test.html`:

1. Chọn file Excel.
2. Nhấn **Đọc và kiểm tra Excel**. Bước này chỉ xử lý nội bộ trong trình duyệt, chưa ghi lên Supabase.
3. Xem số câu hợp lệ, số dòng `LA` bỏ qua, số dòng lỗi, thống kê C1/C2/C3 theo từng khối.
4. Kiểm tra các cảnh báo. Nếu có lỗi hoặc nhiều mã trùng, sửa Excel gốc rồi đọc lại.
5. Nhấn **Nhập dữ liệu đã kiểm tra** và xác nhận. Tầng dữ liệu chia thành các lô **tối đa 300 hàng/lô** với cập nhật tiến trình và nhường luồng chính. Nếu một lô lỗi, những lô trước có thể đã được lưu; cần kiểm tra trước khi nhập lại.

**Hiệu năng:** Worker xử lý ZIP/XLSX riêng, phần chuẩn hóa và nhập dữ liệu nhường trình duyệt mỗi 300 hàng. Nếu Worker không chạy, hệ thống có phương án dự phòng giải mã trên luồng chính; có thể đơ trong thời gian ngắn nếu file rất lớn. Thử với file thật trên thiết bị dự kiến.

## 6. Quy tắc học phí

Chỉ có `paid` và `unpaid` theo học sinh/tháng; **không có thu từng phần**. Dữ liệu Demo có 3 học sinh mẫu. Trong Supabase, nếu thiếu học phí mặc định và học sinh không có `custom_fee`, học sinh chưa được đưa vào danh sách in và có cảnh báo, tránh gửi thông báo với số tiền 0. Số tiền mặc định có thể thêm vào `app_settings` bởi giáo viên bằng công cụ quản trị ở Chặng 4. Chưa có chức năng in/điểm danh thao tác trên giao diện tại Chặng 2.

## 7. Kiểm thử đã thực hiện

Chạy tại thư mục gốc dự án:

```sh
node --experimental-default-type=module tests/test-stage2.mjs
```

Bài test đã chạy với dữ liệu giả lập **6.300 câu**, 21 lô, đồng thời kiểm tra parser, chuẩn hóa số điện thoại, chặn đọc đáp án trên API câu hỏi, phân quyền Demo và trạng thái học phí nhị phân.

- Đã kiểm tra **cú pháp** JavaScript bằng `node --check`.
- **Chưa có file `DatabaseNGANHANGCAUHOI.xlsx` thật của người dùng** để xác nhận mapping từng cột.
- **Chưa thử được kết nối Supabase / SMS OTP thật** do thiếu dự án và tài khoản truy cập.
- Trình duyệt headless trong môi trường kiểm tra chặn truy cập máy chủ localhost; không được coi là kiểm thử Chrome/Vercel hoàn tất.

## 8. Những gì sẽ làm tiếp

**Chặng 3:** `js/lms-engine.js`, `js/portals/student.js`, `js/portals/parent.js` (C1-C3, kết quả, OTP, hồ sơ PH). **Điểm số không được ghi bởi client không tin cậy:** Khi chạy Supabase thật cần triển khai chức năng chấm điểm phía máy chủ (RPC / Edge Function) được kiểm soát, tránh giả điểm. `get_lesson_questions()` hiện chỉ trả câu hỏi không kèm đáp án.

**Chặng 4:** `js/portals/teacher.js`, `js/main.js` (nối nút import của quản trị, danh sách học sinh, báo cáo, học phí và in A5/A4, phân quyền UI). Chỉ đến hết Chặng 4 mới có ứng dụng LMS đầy đủ.

## 9. Quy chuẩn Modern Web Guidance áp dụng

1. JavaScript ES Modules thuần và Web Worker: không jQuery, không build; chia nhỏ xử lý để cải thiện INP.
2. HTML semantic, biểu mẫu có label/aria-live, hiển thị dữ liệu bằng `textContent` để tránh chèn HTML không tin cậy.
3. CSP và RLS: frontend dùng key công khai, các bảng đáp án/trạng thái học phí do quyền backend kiểm soát.
