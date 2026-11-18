# AN PHÚC LMS - CHẶNG 4/4: BỘ MÃ NGUỒN TÍCH HỢP

Đây là dự án **MỚI dùng Supabase**, độc lập với Web điểm danh V4.32 dùng Google Sheets. Không chép đè bộ này lên diemdanhv4.vercel.app.

## 1. Có gì trong ZIP?

- Chặng 1: Giao diện HTML/CSS, in A5/A4, schema Supabase, cấu hình Vercel.
- Chặng 2: config.js, db.js, excel-parser.js và excel-worker.js (đọc Excel theo lô).
- Chặng 3: lms-engine.js, student.js, parent.js, SQL RPC chấm phía máy chủ.
- Chặng 4: teacher.js, teacher-reports.js, main.js, thêm/sửa học sinh, điểm danh, ghi nhận học phí, báo cáo CSV, nhập Excel và in thông báo A5/A4.
- Tài nguyên: logo.jpg, logo_in_A5.png và chu_ky_quoc_hai.png.

## 2. Dùng thử DEMO (không cần Supabase)

1. Giải nén, mở thư mục `AnPhuc_LMS_Stage4`.
2. Tạo GitHub repository MỚI, đưa **các file BÊN TRONG thư mục** lên repository. `index.html` nằm ở gốc.
3. Trên Vercel, `New Project` → import repository → Framework Preset = Other → Deploy.
4. Để trống `SUPABASE_URL` và `SUPABASE_ANON_KEY` trong `js/config.js`: tự chạy Demo.
5. Vào **Cổng Giáo viên** → **Đăng nhập giáo viên (Demo)**. Có thể nhập hồ sơ giả định, điểm danh, học phí và in phiếu.
6. Vào **Cổng Học sinh** hoặc **Cổng Phụ huynh**: số điện thoại mẫu `0900000001`, OTP mẫu `123456`.
7. Kiểm tra import Excel độc lập tại `/stage2-test.html` khi cần.

**DEMO LÀ DỮ LIỆU GIẢ LẬP** lưu trong trình duyệt, không có xác thực quản trị thật. Không nhập thông tin thật của học sinh vào bản Demo công khai.

## 3. Dùng Supabase thật

1. Tạo project Supabase MỚI, SQL Editor chạy **theo thứ tự**:
   `supabase_schema.sql` → `supabase_stage3.sql` → `supabase_stage4.sql`.
2. Authentication > Providers: cấu hình xác thực email/password và Phone SMS với nhà cung cấp SMS thực tế.
3. Tạo tài khoản giáo viên bằng Supabase Auth (email/password); tìm UUID của người dùng trong `auth.users`.
4. SQL Editor chạy **sau khi thay UUID thật** (không dùng mã mẫu):
   `insert into public.staff_roles(user_id,role) values ('<UUID_THAT>', 'admin') on conflict(user_id) do update set role='admin';`
5. Trong `js/config.js`, điền `SUPABASE_URL` và **publishable/anon key**, TUYỆT ĐỐI KHÔNG để service_role hoặc secret key ở frontend.
6. Deploy lên Vercel, đăng nhập Cổng Giáo viên; vào Học phí đặt mức học phí mặc định trước khi lập thông báo.
7. Chỉ nhập danh sách học sinh và ngân hàng câu hỏi khi đã đối chiếu lỗi trong file Excel. Hệ thống cập nhật theo mã, không tự xóa bản ghi cũ.
8. Trước khi phục vụ phụ huynh thật, kiểm tra RLS: mỗi số điện thoại xác thực chỉ xem hồ sơ của con mình. Dùng hai tài khoản phụ huynh độc lập để kiểm chứng.

**Chưa có migration tự động từ Google Sheets cũ sang Supabase.** Không xem đây là hệ thống vận hành thay thế cho đến khi dữ liệu được chuyển và đối soát.

## 4. Các nghiệp vụ giáo viên

- **Ngân hàng câu hỏi:** Chọn XLSX → Kiểm tra Excel → Xem số câu/lỗi → Xác nhận nhập. Câu LA bị bỏ qua. Bật/tắt mỗi bài trong danh mục.
- **Học sinh:** Thêm/sửa theo mã học sinh; trường SĐT phụ huynh 10 chữ số; học sinh nghỉ học có thể bỏ chọn “Đang theo học”, không xóa lịch sử.
- **Điểm danh:** Chọn ngày, lớp, trạng thái Có mặt/Vắng/Có phép → Lưu. Mỗi học sinh chỉ có một bản ghi mỗi ngày.
- **Học phí:** Chọn tháng/năm/khối/lớp; nhập mức mặc định (nếu không có học phí riêng), xem danh sách, chỉ 2 trạng thái Đã đóng / Chưa đóng; xác nhận đã thu tiền mới đánh dấu Đã đóng. Có hoàn tác xác nhận riêng.
- **Thông báo:** Chọn danh sách chưa đóng → chọn học sinh → Đầy đủ/Rút gọn → A5 hoặc 2 phiếu A5 trên A4 ngang → Xem trước → In / Lưu PDF bằng tính năng “Save as PDF” của trình duyệt. Không chuyển khoản tiền qua trang web.
- **Báo cáo:** Tổng học sinh, đã đóng/chưa đóng, số tiền cần thu, lượt điểm danh, điểm kỷ lục, bảng xếp hạng và danh sách chưa có lượt luyện. Xuất CSV (có BOM cho Excel tiếng Việt).

## 5. In chuẩn

- A5 dọc 148 × 210 mm; A4 ngang 297 × 210 mm, mỗi bên một A5; trang lẻ để trống nửa sau.
- Từ hộp thoại Print của Chrome/Edge: chọn **Save as PDF** để có PDF vector, chữ sắc nét, không nén thành ảnh.
- Khi in giấy: chọn chính xác A5 dọc hoặc A4 ngang, **Scale 100%**, Headers and footers = Off, xem trước trước khi in.
- Tài nguyên `logo_in_A5.png` được tối ưu để hiển thị nổi bật trong phiếu; chữ ký đồ họa chỉ dùng sau khi Lê Quốc Hải chấp thuận.
- Nội dung mặc định đã được bố trí gọn, nhưng nếu lời nhắn chung quá dài có thể tràn giấy; cần kiểm tra trước khi in hàng loạt.

## 6. Bảo mật và giới hạn

- Cổng học sinh và phụ huynh dùng OTP khi chạy Supabase, demo OTP chỉ có ở local.
- Đáp án không trả từ bảng questions trực tiếp cho phụ huynh; điểm Supabase được chấm bằng SQL RPC.
- Các thao tác quản trị kiểm soát bằng `staff_roles` + RLS. Không dựa vào nút ẩn ở frontend để bảo mật.
- Không có tích hợp Zalo cá nhân/nhận ảnh chuyển khoản trong bộ LMS mới này.
- Không hứa tính năng theo dõi thanh toán tự động bằng ảnh. Giáo viên phải xác minh thực nhận trước khi ghi Đã đóng.
- Khi nhập Excel Supabase lớn, các lô đã hoàn tất có thể được ghi trước nếu lô sau lỗi; cần kiểm tra và nhập lại phần thiếu.
- `supabase_stage4.sql` bổ sung bảng nhật ký thay đổi trạng thái học phí. Không xóa dữ liệu hiện có. Mức học phí mặc định được công khai để phụ huynh xem được số tiền phải đóng; học phí riêng vẫn nằm trong hồ sơ được RLS bảo vệ.

## 7. Kiểm thử và nghiệm thu

Đã kiểm thử tự động với Node 22:
- `node tests/test-stage2.mjs`
- `node tests/test-stage3.mjs`
- `node tests/test-stage4.mjs`

Các bài kiểm thử này dùng dữ liệu giả lập, không xác minh được tính khả dụng của mạng Supabase, SMS, trình duyệt máy người dùng và máy in.

## 8. Modern Web Guidance sử dụng

- ES Modules thuần, HTML ngữ nghĩa, `<dialog>` và nhiều thành phần form gốc.
- Nhập Excel bằng Worker/chia lô, tránh khóa luồng chính.
- Nội dung từ Google Sheets/Excel được đưa vào `textContent` thay vì HTML trực tiếp; CSS `@page` có khổ A5/A4.
