# TRUNG TÂM TOÁN AN PHÚC – LMS CHẶNG 3/4

**Bản tiếp nối Chặng 2, là dự án Supabase mới. Không ghi đè website V4.32 đang vận hành bằng Google Sheets.**

## 1. File mới / cập nhật

| File | Công dụng |
| --- | --- |
| `js/lms-engine.js` | Thuật toán ba cấp, khóa/mở, đảo câu/phương án MC, tính điểm và kỷ lục. Chỉ dùng chấm ở chế độ Demo; Supabase thật chấm trên SQL. |
| `js/portals/student.js` | OTP, chọn con khi số điện thoại gắn nhiều học sinh; lọc chương; làm MC/TF/SA; kết quả và lời giải sau nộp. |
| `js/portals/parent.js` | OTP, chọn hồ sơ con, điểm lần đầu / kỷ lục / số lần luyện, chuyên cần, lịch học, học phí. |
| `js/portals/ui-utils.js` | Xử lý DOM bằng textContent, render công thức KaTeX, hiển thị URL ảnh HTTPS hợp lệ. |
| `js/stage3-bootstrap.js` | Khởi chạy cổng học sinh và phụ huynh trong `index.html` ở Chặng 3. Được thay bằng `js/main.js` khi làm Chặng 4. |
| `js/db.js` | Bổ sung `submitLessonAttempt()` cho Demo và RPC, bổ sung `getClassSchedules()`. |
| `js/config.js` | Tăng IndexedDB version từ 1 lên 2 để thêm bảng lịch học; không xóa dữ liệu Demo cũ. |
| `supabase_stage3.sql` | Migration bổ sung lịch học và **chấm điểm trên máy chủ** bằng RPC có xác thực / khóa cấp / chống nộp trùng. |
| `styles/app.css`, `index.html` | Kích hoạt hai cổng và giao diện luyện tập; giữ nguyên mẫu in A5/A4 của Chặng 1. |
| `tests/test-stage3.mjs` | Kiểm thử thuật toán, giới hạn quyền truy cập, OTP Demo, 3 cấp, chấm MC/TF/SA, ghi điểm idempotent. |

Tất cả mã nguồn Chặng 1 và 2 vẫn có trong ZIP. `stage2-test.html` vẫn hoạt động để đọc và nhập ngân hàng câu hỏi.

## 2. Dùng thử ngay (không cần Supabase)

1. Giải nén toàn bộ ZIP lên GitHub repository mới; deploy bằng Vercel, preset **Other**, không có build command.
2. Giữ `SUPABASE_URL = ''` và `SUPABASE_ANON_KEY = ''` trong `js/config.js`.
3. Vào trang chủ, bấm **Học sinh** hoặc mở URL `/#student-portal`.
4. Dùng số điện thoại **0900000001**, bấm **Gửi mã OTP**, nhập mã Demo **123456**.
5. Số điện thoại này có hai học sinh mẫu: chọn **Nguyễn Minh An (mẫu), lớp 7A** để luyện Toán 7, hoặc **Phạm Gia Huy (mẫu), lớp 6A** để luyện Toán 6.
6. Bắt đầu Cấp 1: đúng ít nhất 5/10 mới mở Cấp 2; đúng ít nhất 5/10 ở Cấp 2 mới mở Cấp 3. Mỗi cấp làm lại được nhiều lần.
7. Vào `/#parent-portal`: xác minh số điện thoại cùng mã, chọn con và xem kết quả sau lượt làm, điểm danh/lịch học mẫu, trạng thái học phí.
8. Trang `stage2-test.html` vẫn dùng để nhập Excel và kiểm tra nguồn dữ liệu.

Dữ liệu Demo là dữ liệu **giả lập lưu trong trình duyệt**, không cần Internet/SMS để chấm điểm. Không dùng Demo công khai để lưu dữ liệu cá nhân/học phí thật. Mã 123456 **chỉ tồn tại ở chế độ Demo**, KHÔNG phải OTP thực của Supabase.

## 3. Kết nối Supabase thật

**Thứ tự cài đặt** (Supabase SQL Editor của một project mới):

1. Chạy `supabase_schema.sql` của Chặng 1 trước (tạo các bảng học sinh, câu hỏi, tiến độ, RLS...).
2. Chạy **`supabase_stage3.sql`** (bổ sung bảng `class_schedules`, `lesson_attempt_receipts`, RPC `submit_lesson_attempt`). **Bắt buộc chạy migration này mới chấm điểm được.**
3. Điền `SUPABASE_URL` và **publishable/anon key công khai** vào `js/config.js`. Không nhập key `service_role`, `sb_secret_`, mật khẩu, khóa ngân hàng, API key AI ở frontend.
4. Bật Supabase Auth Phone OTP, kết nối SMS provider hợp lệ, cấu hình giới hạn gửi OTP. Mã SMS thật do Supabase xác thực, không dùng mã Demo.
5. Đối chiếu `students.parent_phone` với số đã xác minh. Một số điện thoại có thể gắn nhiều học sinh; chỉ học sinh gắn với số đó mới được xem qua RLS.
6. Nhập học sinh và câu hỏi qua `/stage2-test.html` bằng tài khoản giáo viên có role được gán trong bảng `staff_roles`.
7. Nạp lịch học vào `class_schedules` qua SQL Editor hoặc đợi form quản trị Chặng 4. Không có bảng lịch thì phụ huynh thấy thông báo chưa cập nhật lịch.

**Vì sao phải có migration?** `get_lesson_questions` của Chặng 1 cố ý không trả `correct_answer`. Chỉ SQL RPC `submit_lesson_attempt` mới được đọc đáp án, kiểm tra quyền và ghi điểm. Nếu bỏ qua migration rồi cố tính điểm ở trình duyệt thì học sinh có thể tự sửa điểm, không an toàn.

## 4. Thuật toán chính

- C1: MC nhận biết / thông hiểu; mở ngay khi bài có câu.
- C2: tất cả TF và MC vận dụng; mở khi C1 đạt >=5.00; nếu C1 không có câu thì C2 mở sẵn.
- C3: tất cả SA và MC vận dụng cao; mở khi C2 đạt >=5.00; nếu không có C2, xét C1; nếu không có cả C1/C2, C3 mở sẵn.
- Mỗi cấp chứa N câu: một câu tối đa **10/N**. MC đúng cộng 10/N; TF đúng mỗi ý cộng `(10/N)/4`; SA đúng số học với dung sai `<1e-6` hoặc khớp chuỗi chuẩn hóa. Điểm lượt làm làm tròn 2 chữ số.
- Câu và phương án MC được đảo mỗi lượt; gửi về máy chủ **khóa đáp án gốc A/B/C/D** không phải vị trí được đảo.
- `best_c1`, `best_c2`, `best_c3` không bị giảm khi làm lại. `best_overall` là trung bình ba điểm kỷ lục **chỉ của các cấp có câu**; cấp có câu nhưng chưa làm tính 0.
- `first_overall` ghi ở lần làm **đầu tiên** của bài, không ghi đè khi luyện lại.
- `is_completed=true` khi **mọi cấp có câu hỏi** đạt >=5.00. Tổng lượt luyện tăng sau mỗi lượt hợp lệ.
- `requestId` UUID được dùng để chống ghi điểm hai lần do double-click hoặc mạng gửi lại cùng một yêu cầu.

## 5. Ghi chú về phụ huynh

- Cổng phụ huynh hiển thị số bài chưa hoàn thành, điểm kỷ lục trung bình, số lượt luyện, từng bài học và điểm C1/C2/C3.
- Lịch học lấy từ `class_schedules` theo lớp, `attendance_tuition` cung cấp điểm danh và trạng thái học phí theo tháng.
- **Học phí chỉ có `Đã đóng` hoặc `Chưa đóng`; không hỗ trợ đóng một phần.** Nếu chưa xác định được mức phí thì hiển thị **Chưa có mức phí**, không tự đoán số tiền.
- Nếu `students.enrolled_on` có giá trị, lịch sử học phí sẽ không hiển thị những tháng trước thời điểm nhập học.
- Phần chỉnh sửa lịch học, thu học phí, quản trị học sinh và in A5/A4 vẫn thuộc Chặng 4.

## 6. Kiểm thử

Tại thư mục gốc dự án, có Node.js:

```bash
node --experimental-default-type=module tests/test-stage2.mjs
node --experimental-default-type=module tests/test-stage3.mjs
```

Đã kiểm thử bằng dữ liệu giả lập: MC/TF/SA, đảo đáp án, các trường hợp bài thiếu C1/C2, kỷ lục, điểm lần đầu, OTP Demo, quyền xem anh chị em, chống nộp trùng và việc SDK Supabase chỉ gọi RPC để chấm điểm.

**Giới hạn kiểm thử:** Môi trường hiện tại chặn Chromium truy cập localhost và file nội bộ. Vì vậy **chưa kiểm thử thao tác trực tiếp trên Chrome/Vercel**, chưa chạy SQL trên Supabase thật hoặc kiểm chứng OTP SMS thật. Cần làm những kiểm tra này trước khi sử dụng với dữ liệu học sinh thật. File SQL đã được rà soát tĩnh nhưng chưa được thực thi với PostgreSQL/Supabase thực tế.

## 7. Chặng 4

Còn lại: `js/portals/teacher.js`, `js/main.js`, hoàn thiện nhập/sửa học sinh, bảng xếp hạng, báo cáo, học phí nhị phân, in thông báo A5/A4 (logo chính thức và chữ ký Quốc Hải), triển khai an toàn trên Vercel/Supabase. **Không thay thế website V4.32 đang chạy bằng bộ LMS chưa hoàn tất.**

## 8. Modern Web Guidance áp dụng

1. ES Modules thuần, DOM semantic, native `<dialog>` và `[popover]`; không jQuery/Bootstrap JS.
2. `textContent` và KaTeX `trust:false` thay vì chèn HTML từ ngân hàng đề; giao diện mobile và nhập liệu `inputmode="decimal"`.
3. Cơ chế RPC phía Supabase + RLS bảo vệ đáp án và điểm; câu hỏi/đáp án không chấm trên trình duyệt trong môi trường thực.
