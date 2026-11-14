# Lưu tài khoản nhận tiền cho thành viên — Trạm Có Lúa

## Thành viên sử dụng trên iPhone

1. Mở **Tài khoản nhận tiền** từ menu website hoặc nhấn **🏦 Thêm / quản lý tài khoản nhận tiền** trong **Rút tiền**.
2. Chọn **Ngân hàng** hoặc **ZaloPay**.
3. Với ngân hàng: chọn ngân hàng, nhập **số tài khoản**, **tên chủ tài khoản**; có thể đặt **tên gợi nhớ**.
   - Hỗ trợ **BVBank** dùng số tài khoản định danh ZaloPay chứa chữ và số (ví dụ bắt đầu `99ZP`).
   - Ngân hàng khác vẫn dùng số tài khoản 5–30 chữ số.
   - Với ZaloPay, nhập số điện thoại Việt Nam 10 chữ số (bắt đầu bằng `0`) và tên chủ ví.
4. Chọn **Đặt làm tài khoản mặc định** nếu muốn, rồi nhấn **Lưu tài khoản nhận tiền**.
5. Lần sau vào **Rút tiền** → **Chọn tài khoản nhận tiền đã lưu**; tài khoản mặc định được chọn sẵn.
6. Khách vẫn nhập **Số Lúa muốn rút**, kiểm tra **phí và tổng Lúa sẽ giữ**, nhấn **Gửi yêu cầu** và đợi Admin duyệt.
7. Có thể **Sửa**, **Xóa** hoặc **Đặt mặc định** trong trang quản lý. Mỗi tài khoản thành viên lưu tối đa 10 tài khoản nhận tiền, với mặc định riêng cho mỗi loại Ngân hàng/ZaloPay.

**Quan trọng:** Chọn tài khoản đã lưu không tự chuyển tiền và không tự duyệt. Nếu khách sửa/xóa tài khoản đã lưu thì các yêu cầu rút đã gửi vẫn giữ thông tin người nhận tại lúc tạo yêu cầu. Các khoản Lúa, phí, trạng thái xét duyệt giữ nguyên.

## Bảo mật

- Chỉ người đăng nhập tài khoản của mình mới xem, thêm, sửa hoặc xóa tài khoản nhận tiền của mình.
- Khi rút bằng tài khoản đã lưu, máy chủ tự lấy dữ liệu từ tài khoản của thành viên, **không tin ngân hàng, tên hoặc số tài khoản do trình duyệt sửa**.
- Không tự lưu số tài khoản từ yêu cầu rút cũ hoặc từ yêu cầu gửi thủ công: **chỉ lưu khi thành viên chủ động bấm nút Lưu**.
- Các yêu cầu sửa, xóa và đặt mặc định đều yêu cầu đăng nhập và xác nhận cùng nguồn. Nút xóa có hộp xác nhận.
- Số tài khoản chỉ hiển thị cho chủ tài khoản khi mở trang quản lý; không chia sẻ với người dùng khác.
- Lưu tài khoản không phải xác minh được quyền sở hữu của số tài khoản; Admin vẫn phải đối chiếu đúng người nhận trước khi chuyển tiền thật.

## Bước kích hoạt Cloudflare D1 (chỉ thực hiện MỘT lần)

1. Sao lưu đúng D1 **`tram-lua-db`** đang dùng của Worker `tram-lua`.
2. Trên iPhone vào Cloudflare → **D1 SQL Database** → `tram-lua-db` → **Console**.
3. Mở tệp [migrations/0006_payout_accounts.sql](https://github.com/kiemluaonline/kiemluaonline/blob/main/migrations/0006_payout_accounts.sql) trong GitHub, sao chép **toàn bộ** và dán vào Console → **Execute**.
4. Kiểm tra báo **This query successfully executed** và bảng `payout_accounts` xuất hiện.
5. Triển khai **cả Worker mới và frontend mới** từ GitHub lên Cloudflare. GitHub Actions chỉ xác minh mã nguồn, không đảm bảo Cloudflare đã chạy bản mới.
6. Tải lại Safari rồi vào **Tài khoản nhận tiền** để thêm thử một tài khoản. Không nhập số tài khoản thật vào ảnh công khai hoặc gửi người lạ.

**Không chạy lại `0005_cards.sql`** vì chức năng thẻ cào trước đó đã được thiết lập. Migration `0006` chỉ tạo bảng riêng, không xóa bảng ví Lúa, nhiệm vụ, giao dịch rút tiền hay đổi thẻ cào.

## Khi chưa chạy SQL

Trang lưu tài khoản hiển thị thông báo chưa tải được; biểu mẫu **Rút tiền vẫn cho phép nhập thủ công như cũ**. Sau khi tạo bảng mới và cập nhật Worker, phần lưu tài khoản mới sẽ sử dụng được.
