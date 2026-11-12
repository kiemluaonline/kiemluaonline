# TRẠM LÚA — Website nhiệm vụ tích Lúa, thành viên & Admin

**Phiên bản 1.0 — 12/11/2026.** Đây là **mã nguồn có backend và cơ sở dữ liệu**, không chỉ là bản thiết kế ảnh hoặc dữ liệu giả. Giao diện thích ứng trên điện thoại và máy tính. Dự án chưa được đưa lên tài khoản Cloudflare/tên miền của bạn vì không có quyền đăng nhập, tên miền cụ thể và thông tin cấu hình.

## 1. Chức năng đã viết

| Thành viên | Quản trị |
| --- | --- |
| Tạo tài khoản, đăng nhập bằng email/mật khẩu, đổi mật khẩu | Tạo tài khoản Admin đầu tiên bằng khóa bí mật của chủ trang |
| Tổng quan ví Lúa, lịch sử cộng/trừ | Số liệu thành viên, Lúa đã phát hành, nhiệm vụ đang bật |
| Nhiệm vụ liên kết/video/khác | Thêm/sửa/bật/tắt, đặt thưởng/thời gian/tần suất |
| CAPTCHA phép cộng 1–10, sai đổi câu hỏi, đủ thời gian mới nộp | Chọn duyệt tự động hoặc duyệt bằng chứng thủ công |
| Lịch sử nhiệm vụ, sổ Lúa | Duyệt/từ chối bằng chứng, cộng điểm đúng một lần |
| Tuyển Ref, theo dõi số người giới thiệu | Đặt thưởng Ref sau khi người được mời nhận thưởng nhiệm vụ thật |
| Điểm danh hằng ngày | Tùy chỉnh thưởng điểm danh |
| Yêu cầu rút và theo dõi trạng thái | Thiết lập tỷ giá, hạn mức, duyệt chuyển khoản hoặc hoàn Lúa |
| Hiện IP và mã trình duyệt gần đúng | Nhật ký chống gian lận, IP nhiều tài khoản, khóa/mở tài khoản |

**Điều quan trọng:** Chế độ nhiệm vụ tự động chỉ chứng minh đã qua thời gian tối thiểu và CAPTCHA, **không chứng minh đã thật sự xem video/hoàn thành hành động tại website khác**. Với các nhiệm vụ cần xác minh, hãy chọn chế độ **Admin duyệt bằng chứng**. Hệ thống không có khả năng tự chuyển tiền ngân hàng.

## 2. Những tệp quan trọng

- `public/index.html`, `public/style.css`, `public/app.js` — giao diện.
- `src/worker.js` — backend thực tế, kiểm tra phiên đăng nhập, phân quyền, ghi Lúa, xử lý chống trùng.
- `migrations/0001_init.sql` — cấu trúc cơ sở dữ liệu D1.
- `wrangler.jsonc` — cấu hình Cloudflare Workers.
- `public/terms.html`, `public/privacy.html` — trang điều khoản/quyền riêng tư, **phải điền thông tin chủ website trước khi mở công khai**.
- `tests/api_smoke.mjs` — kiểm tra nghiệp vụ dùng SQLite, không cần internet.

## 3. Đưa website chạy thử trên máy tính Windows

> Có thể làm từng bước, không cần mua hosting. Cần máy tính có internet và tài khoản Cloudflare miễn phí. Không gửi mật khẩu hoặc khóa bí mật cho người khác.

1. Cài **Node.js phiên bản LTS** từ https://nodejs.org (chọn bản phù hợp Windows). Khởi động lại nếu được yêu cầu.
2. Giải nén `tram-lua-website.zip` ra một thư mục trên máy, ví dụ `Downloads\\tram-lua-website`.
3. Mở thư mục đó bằng File Explorer, bấm ô địa chỉ ở trên cùng, gõ `cmd`, rồi Enter. Cửa sổ lệnh màu đen sẽ mở **đúng thư mục**.
4. Gõ `npm install`, Enter. Máy cần kết nối mạng để cài các thư viện.
5. Gõ `npx wrangler login` và đăng nhập hoặc đăng ký tại https://dash.cloudflare.com.
6. Gõ `npx wrangler d1 create tram-lua-db`, Enter. Cloudflare sẽ in ra `database_id` — một dãy định danh UUID. **Sao chép đúng UUID của bạn**, không sử dụng UUID giả.
7. Mở file `wrangler.jsonc` bằng Notepad. Thay đúng chuỗi `REPLACE_WITH_YOUR_D1_DATABASE_ID` bằng UUID vừa nhận. Lưu file.
8. Gõ `copy .dev.vars.example .dev.vars`, Enter. Mở `.dev.vars` bằng Notepad, thay hai chuỗi mẫu bằng **hai chuỗi ngẫu nhiên khác nhau, ít nhất 32 ký tự**, giữ nguyên tên `SETUP_KEY` và `DEVICE_SALT`.
9. Gõ `npm run db:local` để tạo cơ sở dữ liệu chạy trên máy.
10. Gõ `npm run dev`, Enter. Truy cập đường dẫn mà dòng lệnh hiển thị, thường là `http://localhost:8787`.
11. Ở lần đầu, chọn **Thiết lập Admin**, nhập **khóa `SETUP_KEY`** đã đặt ở bước 8, tên, email và mật khẩu Admin riêng (ít nhất 10 ký tự).
12. Đăng nhập Admin, vào **Quản lý nhiệm vụ** tạo nhiệm vụ thật. Ban đầu không có nhiệm vụ mẫu và chưa có thưởng giả.

Nếu bạn chỉ dùng iPhone, việc chạy các dòng lệnh và cấu hình dự án sẽ thuận tiện hơn trên laptop Windows.

## 4. Đưa lên Internet để dùng thật

Từ thư mục dự án trong cửa sổ lệnh:

1. Chạy `npm run db:remote` để tạo bảng tại cơ sở dữ liệu Cloudflare **thật** (khác với DB chạy thử trên máy).
2. Chạy `npx wrangler secret put SETUP_KEY`, Enter; nhập khóa bí mật cho thiết lập Admin thật (ít nhất 24 ký tự; nên 32+). Dòng nhập sẽ không hiện ra.
3. Chạy `npx wrangler secret put DEVICE_SALT`, Enter; nhập chuỗi bí mật **khác SETUP_KEY**, 32+ ký tự để tạo mã nhận diện trình duyệt.
4. Chạy `npm run deploy`. Kết quả sẽ có đường dẫn `https://tram-lua.<ten-tai-khoan>.workers.dev` (tên cụ thể do Cloudflare cấp).
5. Mở đường dẫn trên, vào mục **Thiết lập Admin** và nhập đúng SETUP_KEY đã tạo ở bước 2. Thiết lập xong **chạy `npx wrangler secret delete SETUP_KEY`** để không giữ lại khóa khởi tạo Admin.
6. Trong Admin, cấu hình phần thưởng phù hợp, chỉ bật nhiệm vụ đã xác nhận nguồn thưởng và kiểm thử đủ điều kiện thực tế. **Không bật rút tiền nếu chưa có nguồn tiền chi trả, tỷ giá minh bạch và quy trình đối chiếu.**

Các thao tác triển khai cần làm trên **tài khoản Cloudflare do bạn sở hữu**. Dự án được chuẩn bị để dùng gói miễn phí trong hạn mức nhưng không có cam kết miễn phí không giới hạn. Xem giới hạn: https://developers.cloudflare.com/workers/platform/limits/ và https://developers.cloudflare.com/workers/platform/pricing/.

## 5. Trỏ tên miền đã mua tại Tenten

1. Trong bảng điều khiển Cloudflare, bấm **Add domain / Add a website** và nhập **tên miền chính xác** đã mua tại Tenten.
2. Cloudflare hiển thị **hai nameserver (NS)** riêng cho tên miền. Đăng nhập Tenten, vào **quản lý tên miền → DNS / Nameserver**, thay nameserver hiện có bằng hai tên đó. Đừng tự đoán tên NS; phải lấy đúng từ Cloudflare.
3. Khi Cloudflare báo tên miền đã **Active**, vào **Workers & Pages → tram-lua → Settings → Domains & Routes → Add → Custom Domain**, nhập tên miền của bạn.
4. Bật HTTPS và thử đăng nhập, nhận Lúa, trang Admin trên đúng tên miền. Cloudflare tự tạo cấu hình DNS/chứng chỉ cho Custom Domain nếu tên miền nằm trong zone Cloudflare.

**Lưu ý:** Nếu tên miền đang dùng dịch vụ email (Google Workspace, v.v.), sao lưu và kiểm tra bản ghi MX/TXT/SPF/DKIM trước khi đổi nameserver để tránh mất email. Việc đổi NS không làm mất quyền sở hữu tên miền Tenten. Có thể cần đợi DNS cập nhật.

## 6. Kiểm tra trước khi cho người thật dùng

Chạy `node tests/api_smoke.mjs` để kiểm tra đăng ký, phân quyền, CAPTCHA đúng/sai, thời gian tối thiểu, nhận thưởng duy nhất, giới thiệu, điểm danh, duyệt bằng chứng, yêu cầu rút/hoàn Lúa. Chạy `python tests/schema_check.py` nếu máy có Python 3 để kiểm tra SQL. Kết quả test chạy trên SQLite mô phỏng D1, **không thay thế kiểm thử trên Cloudflare Workers/D1 thật**.

### Việc quan trọng còn phải hoàn tất trước khi vận hành quy mô công khai hoặc có tiền thật

- Kiểm thử trực tiếp trên Cloudflare free tier: thời gian CPU của các thao tác băm mật khẩu, hoạt động của D1, tải đồng thời/đua lệnh nhận thưởng và xử lý rút.
- Thêm xác nhận email, lấy lại mật khẩu, bảo vệ đăng ký bằng Turnstile/Cloudflare WAF, xác thực hai bước cho Admin; xử lý yêu cầu xóa/xuất dữ liệu cá nhân.
- Quy trình ghi nhận/kiểm tra bằng chứng, đối chiếu giao dịch ngân hàng, xử lý khiếu nại và giám sát rủi ro. Không thể xác minh hoạt động bên ngoài chỉ bằng mở link và giải phép tính.
- Điền chính sách quyền riêng tư/điều khoản, đơn vị vận hành, thông tin liên hệ, xác định nghĩa vụ pháp lý và thuế phù hợp trước khi nhận người dùng thật.
- Xem xét bảo vệ thêm thông tin ngân hàng lưu trong D1, kiểm soát quyền truy cập Admin và quy trình sao lưu, phục hồi dữ liệu.
- Xác nhận toàn bộ tính năng với website tham khảo. `kiemluamoi.site` không truy cập được qua công cụ kiểm tra ở thời điểm tạo dự án, vì thế không thể tuyên bố đã đối chiếu được 100% các chức năng ẩn của website đó.

## 7. Giới hạn nền tảng miễn phí

Cloudflare Workers Free có hạn mức API và CPU; D1 Free có giới hạn đọc, ghi và lưu trữ. Khi vượt giới hạn có thể bị chặn cho đến khi được đặt lại hoặc cần nâng cấp. Vì thế bản mã nguồn **không cam kết phục vụ lượng truy cập lớn mà hoàn toàn miễn phí**.

## 8. Các nguyên tắc an toàn

- **Không tải `.dev.vars` hoặc khóa thiết lập lên GitHub, không dán chúng vào chat.**
- Không đưa DB ID/khóa bí mật trong ảnh chụp công khai; DB ID không phải mật khẩu nhưng vẫn nên quản lý như thông tin cấu hình.
- Không hứa rút tiền khi tính năng thanh toán chưa sẵn sàng.
- Đã có kiểm tra IP và trình duyệt gần đúng, nhưng không có phương pháp phát hiện gian lận chính xác tuyệt đối.
