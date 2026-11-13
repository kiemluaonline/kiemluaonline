// Vietnamese / Hmoob Dawb (RPA) interface translations.
// Chỉ thay thế câu chữ hiển thị. Không dịch giá trị nhập, địa chỉ IP,
// nội dung do thành viên/Admin tự viết hay các bản ghi dữ liệu.
(function(){
 'use strict';
 const STORAGE_KEY='tramco-lua.language.v1';
 const translations={
  "Đăng nhập": "Nkag mus",
  "Đăng ký": "Sau npe",
  "Tiếng Việt": "Tiếng Việt",
  "Hmoob": "Hmoob",
  "Nhiệm vụ": "Cov haujlwm",
  "Cách hoạt động": "Txoj kev ua haujlwm",
  "Hỏi đáp": "Lus nug thiab lus teb",
  "Làm nhiệm vụ.": "Ua cov haujlwm.",
  "Tích Lúa.": "Sau Lúa.",
  "Nhận thành quả.": "Txais txiaj ntsig.",
  "Khám phá cơ hội tích Lúa mỗi ngày": "Nrhiav txoj hauv kev sau Lúa txhua hnub",
  "Một nơi để khám phá các nhiệm vụ trực tuyến, theo dõi kết quả và tích lũy Lúa khi nhiệm vụ được xác nhận hợp lệ.": "Nrhiav cov haujlwm hauv online, saib koj cov txiaj ntsig, thiab sau Lúa thaum koj txoj haujlwm raug lees paub.",
  "Bắt đầu miễn phí": "Pib dawb",
  "Tìm hiểu cách hoạt động": "Saib txoj kev ua haujlwm",
  "✓ Đăng ký tài khoản miễn phí": "✓ Sau npe tus as khauj dawb",
  "✓ Lịch sử điểm Lúa rõ ràng": "✓ Saib tau keeb kwm Lúa",
  "KHÁM PHÁ NHIỆM VỤ": "NRHIAV COV HAUJLWM",
  "Nhiều cách tham gia,": "Muaj ntau txoj kev koom,",
  "một hành trình tích Lúa.": "ib txoj kev sau Lúa.",
  "Chọn nhiệm vụ phù hợp và làm theo hướng dẫn. Điều kiện và mức Lúa cụ thể được hiển thị trong tài khoản.": "Xaiv txoj haujlwm uas haum koj thiab ua raws li cov lus qhia. Cov cai thiab tus nqi Lúa yuav qhia hauv koj tus as khauj.",
  "Nhiệm vụ App": "Haujlwm App",
  "Nhiệm vụ Link": "Haujlwm Link",
  "Nhiệm vụ Video": "Haujlwm Video",
  "Nhiệm vụ Khác": "Lwm yam haujlwm",
  "Khám phá ứng dụng, đăng ký hoặc thực hiện các bước được yêu cầu.": "Nrhiav app tshiab, sau npe, lossis ua raws li cov kauj ruam tau qhia.",
  "Truy cập liên kết, thực hiện yêu cầu và gửi kết quả xác minh.": "Qhib qhov txuas, ua raws li cov lus qhia, thiab xa qhov pov thawj.",
  "Xem nội dung và đáp ứng thời gian hoặc điều kiện được công bố.": "Saib cov video thiab ua kom tau raws lub sijhawm lossis cov cai.",
  "Tham gia các hoạt động mới do quản trị viên đăng tải khi có sẵn.": "Koom cov haujlwm tshiab uas tus tswj hwm tshaj tawm.",
  "Làm theo hướng dẫn": "Ua raws li cov lus qhia",
  "Hoàn thành liên kết": "Ua qhov txuas kom tiav",
  "Khám phá nội dung": "Saib cov ntsiab lus",
  "Xem hoạt động": "Saib cov haujlwm",
  "DỄ DÀNG BẮT ĐẦU": "PIB TAU YOOJ YIM",
  "Chỉ ba bước để": "Tsuas yog peb kauj ruam",
  "bắt đầu tích Lúa.": "los pib sau Lúa.",
  "Tạo tài khoản": "Tsim tus as khauj",
  "Hoàn thành nhiệm vụ": "Ua haujlwm kom tiav",
  "Tích lũy điểm Lúa": "Sau cov ntsiab lus Lúa",
  "Đăng ký bằng email hoặc tiếp tục với Google khi tính năng được bật.": "Sau npe nrog email lossis txuas ntxiv nrog Google thaum muaj.",
  "Đọc yêu cầu, thực hiện và gửi bằng chứng khi nhiệm vụ cần xét duyệt.": "Nyeem cov cai, ua haujlwm, thiab xa pov thawj thaum yuav tsum kuaj.",
  "Nhận Lúa khi kết quả hợp lệ và theo dõi số dư, lịch sử ngay trong tài khoản.": "Tau Lúa thaum cov haujlwm raug lees paub, thiab saib koj qhov tshuav nrog keeb kwm.",
  "Minh bạch": "Qhia meej",
  "& an toàn": "thiab nyab xeeb",
  "RÕ RÀNG TỪNG BƯỚC": "TXHUA KAUJ RUAM MEEJ",
  "Bạn luôn biết": "Koj yeej paub",
  "điểm Lúa đến từ đâu.": "koj tau Lúa qhov twg.",
  "Nhiệm vụ có hướng dẫn và trạng thái xử lý. Bạn có thể xem lịch sử tích Lúa và gửi yêu cầu quy đổi khi chương trình cho phép, theo điều kiện đã công bố.": "Txhua txoj haujlwm muaj lus qhia thiab xwm txheej. Koj saib tau keeb kwm Lúa thiab thov pauv thaum kev pabcuam tso cai raws li cov cai.",
  "✓ Theo dõi lịch sử": "✓ Saib keeb kwm",
  "✓ Kiểm tra kết quả": "✓ Kuaj qhov tshwm sim",
  "✓ Bảo vệ tài khoản": "✓ Tiv thaiv tus as khauj",
  "CÂU HỎI THƯỜNG GẶP": "COV LUS NUG NQUAG MUAJ",
  "Bạn đang thắc mắc?": "Koj puas muaj lus nug?",
  "Những điều nên biết trước khi bắt đầu.": "Tej yam koj yuav tsum paub ua ntej pib.",
  "Đăng ký Trạm Có Lúa có mất phí không?": "Sau npe rau Trạm Có Lúa puas tau them nyiaj?",
  "Không mất phí để tạo tài khoản. Bạn có thể đăng ký bằng email/mật khẩu hoặc đăng nhập Google khi được hỗ trợ.": "Tsim tus as khauj yog pub dawb. Koj siv email thiab lo lus zais los sau npe, lossis Google thaum muaj.",
  "Làm nhiệm vụ xong có nhận Lúa ngay không?": "Ua haujlwm tas puas tau Lúa tam sim?",
  "Tùy từng nhiệm vụ. Một số nhiệm vụ cần Admin kiểm tra bằng chứng trước khi cộng Lúa; điều kiện được nêu trong phần nhiệm vụ.": "Nyob ntawm txoj haujlwm. Qee txoj haujlwm yuav tsum tos tus tswj hwm kuaj pov thawj ua ntej ntxiv Lúa.",
  "Lúa có phải tiền mặt không?": "Lúa puas yog nyiaj ntsuab?",
  "Không. Lúa là điểm nội bộ. Yêu cầu quy đổi chỉ khả dụng khi hệ thống bật tính năng, có tỷ giá và đáp ứng điều kiện thanh toán đã công bố.": "Tsis yog. Lúa yog cov qhab nia hauv lub vev xaib. Kev thov pauv tsuas muaj thaum lub tshuab qhib thiab ua tau raws cov cai.",
  "Tôi có thể theo dõi kết quả ở đâu?": "Kuv saib kuv cov txiaj ntsig qhov twg?",
  "Sau khi đăng nhập, bạn có thể xem nhiệm vụ, ví Lúa, lịch sử và trạng thái yêu cầu rút tiền tại khu vực thành viên.": "Thaum nkag mus, koj saib tau haujlwm, hnab Lúa, keeb kwm thiab cov ntawv thov rho nyiaj hauv tus as khauj.",
  "CÙNG BẮT ĐẦU NÀO": "CIA PEB PIB UA KE",
  "Trạm đã sẵn sàng.": "Trạm twb npaj txhij.",
  "Bạn đã sẵn sàng chưa?": "Koj puas npaj txhij?",
  "Khám phá những nhiệm vụ phù hợp với bạn và bắt đầu tích lũy từng điểm Lúa.": "Nrhiav cov haujlwm uas haum koj thiab pib sau Lúa ib qho zuj zus.",
  "Tham gia Trạm Có Lúa": "Koom Trạm Có Lúa",
  "Làm nhiệm vụ • Tích Lúa • Nhận thành quả": "Ua haujlwm • Sau Lúa • Txais txiaj ntsig",
  "Điều khoản sử dụng": "Cov nqe lus siv",
  "Quyền riêng tư": "Kev ceev ntiag tug",
  "Câu hỏi thường gặp": "Cov lus nug nquag muaj",
  "Lúa là điểm tích lũy nội bộ, không phải tiền mặt. Các khoản thưởng và yêu cầu quy đổi phụ thuộc điều kiện được công bố; không cam kết thu nhập.": "Lúa yog qhab nia hauv lub vev xaib, tsis yog nyiaj ntsuab. Cov khoom plig thiab kev pauv nyob ntawm cov cai; tsis tau cog lus tias yuav muaj nyiaj tau los.",
  "NỀN TẢNG NHIỆM VỤ": "LUB VEV XAIB HAUJLWM",
  "HÀNH TRÌNH TÍCH LÚA": "TXOJ KEV SAU LÚA",
  "Mỗi nhiệm vụ nhỏ,": "Ib txoj haujlwm me,",
  "một bước tiến mới.": "yog ib kauj ruam tshiab.",
  "Khám phá ứng dụng": "Nrhiav cov app",
  "Thực hiện theo hướng dẫn": "Ua raws lus qhia",
  "Nhiệm vụ liên kết": "Haujlwm txuas",
  "Gửi kết quả để xác minh": "Xa pov thawj kom kuaj",
  "Nội dung video": "Cov video",
  "Hoàn thành yêu cầu": "Ua kom tiav",
  "Tiến độ & thưởng được ghi nhận trong tài khoản": "Kev ua haujlwm thiab Lúa raug teev hauv tus as khauj",
  "Bắt đầu từ những điều nhỏ": "Pib ntawm tej yam me",
  "Quay lại trang chủ": "Rov mus nplooj xub thawj",
  "← Quay lại trang chủ": "← Rov mus nplooj xub thawj",
  "THÀNH VIÊN MỚI": "TSWV CUAB TSHIAB",
  "CHÀO MỪNG TRỞ LẠI": "ZOO SIAB TXAIS TOS ROV QAB",
  "TRẠM CÓ LÚA • NỀN TẢNG NHIỆM VỤ": "TRẠM CÓ LÚA • LUB VEV XAIB HAUJLWM",
  "LÀM NHIỆM VỤ · TÍCH LÚA": "UA HAUJLWM · SAU LÚA",
  "Đăng ký miễn phí để bắt đầu làm nhiệm vụ và quản lý điểm Lúa. Mọi phần thưởng phụ thuộc kết quả được xác minh.": "Sau npe dawb kom pib ua haujlwm thiab saib koj Lúa. Nqi zog tsuas muab thaum tau kuaj qhov ua tiav lawm.",
  "Bắt đầu hoàn thành nhiệm vụ, tích Lúa và theo dõi phần thưởng của bạn.": "Pib ua haujlwm, sau Lúa thiab saib koj cov nqi zog.",
  "Tiếp tục hành trình làm nhiệm vụ và quản lý tài khoản của bạn.": "Txuas ntxiv ua haujlwm thiab tswj koj tus as khauj.",
  "Tạo Admin đầu tiên": "Tsim thawj tus tswj hwm",
  "QUẢN TRỊ HỆ THỐNG": "TUS TSWJ HWM",
  "Chỉ dành cho chủ website.": "Tsuas yog rau tus tswv lub vev xaib.",
  "Tên đăng nhập": "Npe nkag mus",
  "4–20 ký tự, a-z, 0-9": "4–20 tus cim, a-z, 0-9",
  "Email hoặc tên đăng nhập": "Email lossis npe nkag mus",
  "Nhập email hoặc tên đăng nhập": "Sau email lossis npe nkag mus",
  "Mật khẩu": "Lo lus zais",
  "Nhập mật khẩu của bạn": "Sau koj lo lus zais",
  "Ít nhất 8 ký tự": "Yam tsawg kawg 8 tus cim",
  "Mã giới thiệu (không bắt buộc)": "Tus lej caw (tsis tas muaj)",
  "Ví dụ: A1B2C3D4E5 (10 ký tự)": "Piv txwv: A1B2C3D4E5 (10 tus cim)",
  "Tôi đồng ý": "Kuv pom zoo rau",
  "Điều khoản": "Cov nqe lus",
  "Chính sách quyền riêng tư": "Txoj cai ceev ntiag tug",
  "HOẶC": "LOSSIS",
  "Đăng ký với Google": "Sau npe nrog Google",
  "Tiếp tục với Google": "Txuas ntxiv nrog Google",
  "Đăng ký bằng Google sẽ dùng tên hiển thị từ tài khoản Google. Hãy tích đồng ý điều khoản trước khi tiếp tục.": "Sau npe nrog Google siv lub npe hauv Google. Thov kos tias koj pom zoo cov nqe lus ua ntej.",
  "Đã có tài khoản?": "Puas muaj tus as khauj lawm?",
  "Chưa có tài khoản?": "Tseem tsis tau muaj tus as khauj?",
  "Đăng nhập bằng Google": "Nkag mus nrog Google",
  "Đăng nhập Google sẽ hiển thị sau khi chủ website cấu hình Google Cloud.": "Nkag Google yuav muaj thaum tus tswv teeb Google Cloud tiav.",
  "Gmail mới cần xác minh qua Đăng ký với Google bên dưới. Tài khoản Gmail đã đăng ký trước đó vẫn có thể dùng mật khẩu.": "Gmail tshiab yuav tsum txheeb xyuas nrog Google. Tus as khauj Gmail qub tseem siv tau lo lus zais.",
  "Hoàn tất đăng ký Google": "Ua tiav kev sau npe Google",
  "Đồng ý và tạo tài khoản": "Pom zoo thiab tsim tus as khauj",
  "Hủy và trở lại": "Tso tseg thiab rov qab",
  "ĐĂNG KÝ BẰNG GOOGLE": "SAU NPE NROG GOOGLE",
  "Đăng xuất": "Tawm mus",
  "Đăng xuất ↗": "Tawm mus ↗",
  "Tổng quan": "Saib tag nrho",
  "Tuyển Ref": "Caw phooj ywg",
  "Phúc lợi": "Cov txiaj ntsig",
  "Rút tiền": "Rho nyiaj",
  "Lịch sử": "Keeb kwm",
  "Hồ sơ": "Tus as khauj",
  "Tổng quan Admin": "Saib tag nrho Admin",
  "Quản lý nhiệm vụ": "Tswj cov haujlwm",
  "Thành viên": "Cov tswv cuab",
  "Duyệt bằng chứng": "Txheeb xyuas pov thawj",
  "Yêu cầu rút tiền": "Kev thov rho nyiaj",
  "Chống gian lận": "Tiv thaiv kev dag",
  "Cài đặt": "Kev teeb tsa",
  "Hồ sơ của tôi": "Kuv tus as khauj",
  "BẢNG QUẢN TRỊ": "PHAJ TSWJ HWM",
  "KHÔNG GIAN THÀNH VIÊN": "CHAW TSWV CUAB",
  "Bảng điều khiển": "Nplooj tswj",
  "Quản lý minh bạch • Cập nhật theo dữ liệu thật": "Tswj meej • Siv ntaub ntawv tiag",
  "TRẠM CÓ LÚA • HỆ THỐNG THÀNH VIÊN": "TRẠM CÓ LÚA • KEV TSWJ TSWV CUAB",
  "VÍ TÍCH LŨY": "HNAB LÚA",
  "Lúa hiện có": "Lúa tam sim no",
  "Xem nhiệm vụ →": "Saib cov haujlwm →",
  "Số dư hiện tại": "Qhov tshuav tam sim no",
  "Lúa có thể sử dụng": "Lúa siv tau",
  "Tổng Lúa đã ghi nhận": "Tag nrho Lúa teev tseg",
  "Bao gồm thưởng đã duyệt": "Suav cov nqi zog tau pom zoo",
  "Nhiệm vụ chưa làm": "Cov haujlwm tseem tshuav",
  "Đang mở thực tế": "Cov haujlwm muaj tam sim no",
  "Người được giới thiệu": "Cov neeg raug caw",
  "Tài khoản đã đăng ký": "Cov as khauj sau npe lawm",
  "📢 Thông báo hệ thống": "📢 Cov ntawv ceeb toom",
  "🛡️ Kiểm tra chống gian lận": "🛡️ Kuaj kev dag",
  "IP đang truy cập": "IP siv tam sim no",
  "🌾 LÚA HÔM NAY": "🌾 LÚA HNUB NO",
  "Nhiệm vụ đã gửi hôm nay": "Cov haujlwm xa hnub no",
  "Tổng Lúa Link đã duyệt": "Lúa Link tau pom zoo",
  "ĐỔI NGÀY SAU": "HLOOV HNUB TOM NTEJ",
  "Làm theo hướng dẫn của quản trị viên.": "Ua raws li tus tswj hwm cov lus qhia.",
  "Lịch sử Lúa": "Lúa keeb kwm",
  "Tất cả thay đổi số dư đều được lưu vào sổ giao dịch.": "Txhua qhov kev hloov Lúa raug khaws tseg hauv keeb kwm.",
  "📗 Sổ Lúa": "📗 Phau Lúa",
  "📋 Lịch sử nhiệm vụ": "📋 Keeb kwm haujlwm",
  "Trung tâm điều hành": "Chaw tswj hwm",
  "Cài đặt hệ thống": "Teeb tsa lub tshuab",
  "Thiết lập chung": "Kev teeb tsa dav dav",
  "Thông báo thành viên": "Ceeb toom rau tswv cuab",
  "Hồ sơ cá nhân": "Kuv tus as khauj",
  "Thông tin tài khoản": "Cov ntaub ntawv as khauj",
  "Đổi mật khẩu": "Hloov lo lus zais",
  "Mã giới thiệu riêng": "Koj tus lej caw",
  "Thành viên đã giới thiệu": "Cov tswv cuab tau caw",
  "Phúc lợi thành viên": "Cov txiaj ntsig tswv cuab",
  "QUÀ MỖI NGÀY": "KHOOM PLIG TXHUA HNUB",
  "☀ Điểm danh hôm nay": "☀ Kos npe hnub no",
  "Điều kiện nhận thưởng": "Cov cai txais nqi zog",
  "Tạo yêu cầu rút": "Tsim ntawv thov rho nyiaj",
  "Ngân hàng nhận": "Txhab nyiaj txais",
  "Thông tin minh bạch": "Cov ntaub ntawv qhia meej",
  "Quản lý thành viên": "Tswj cov tswv cuab",
  "Tạo nhiệm vụ thật": "Tsim txoj haujlwm tshiab",
  "Sửa nhiệm vụ": "Kho txoj haujlwm",
  "Hướng dẫn / mô tả": "Lus qhia / piav qhia",
  "Hướng dẫn quản trị": "Lus qhia rau Admin",
  "Nhật ký sự kiện gần đây": "Cov xwm txheej nyuam qhuav tshwm",
  "🛡️ Anti-Fraud 2.0 — Rủi ro từng tài khoản": "🛡️ Anti-Fraud 2.0 — Kev pheej hmoo ntawm txhua as khauj",
  "📱 Nhiều tài khoản dùng chung một mã trình duyệt": "📱 Ntau as khauj siv ib tus lej browser",
  "🌐 Nhiều mã trình duyệt trên cùng IP / dải IPv6": "🌐 Ntau tus lej browser siv tib IP / IPv6",
  "📍 IPv4 thực tế đã ghi nhận": "📍 IPv4 tiag uas tau teev tseg",
  "🚨 Cảnh báo IP trùng lặp: IPv4 và IPv6": "🚨 Ceeb toom IP sib xws: IPv4 thiab IPv6",
  "⚠ Cảnh báo link rút gọn hôm nay": "⚠ Ceeb toom link luv hnub no",
  "🔎 Báo cáo chống gian lận": "🔎 Daim ntawv qhia kev dag",
  "⚠️ Dấu hiệu rủi ro": "⚠️ Cov cim pheej hmoo",
  "📱 Mã trình duyệt đã ghi nhận": "📱 Tus lej browser uas tau teev tseg",
  "👥 Tài khoản có dấu hiệu liên quan": "👥 Cov as khauj muaj kev txuas",
  "Không nghiêm trọng": "Tsis hnyav",
  "Nghiêm trọng": "Hnyav",
  "Thấp": "Tsawg",
  "Hoạt động": "Tseem siv tau",
  "Tạm khóa": "Kaw ib ntus",
  "Đã duyệt": "Tau pom zoo",
  "Đang chờ": "Tos",
  "Từ chối": "Tsis kam txais",
  "Đã thanh toán": "Them lawm",
  "Số tài khoản không đúng": "Tus lej as khauj tsis raug",
  "Chưa có dữ liệu thực tế": "Tseem tsis tau muaj ntaub ntawv",
  "Các bản ghi sẽ xuất hiện sau khi người dùng thực hiện thao tác.": "Cov ntaub ntawv yuav tshwm thaum muaj kev siv.",
  "Đăng nhập để tiếp tục nhiệm vụ.": "Nkag mus kom txuas ntxiv cov haujlwm.",
  "Đăng nhập Google an toàn và đơn giản.": "Nkag Google yooj yim thiab nyab xeeb.",
  "TÀI KHOẢN TẠM THỜI BỊ KHÓA": "TUS AS KHAUJ RAUG KAW IB NTUS",
  "TÀI KHOẢN ĐÃ BỊ KHÓA VĨNH VIỄN": "TUS AS KHAUJ RAUG KAW MUS LI",
  "⛔ Quyết định xử lý": "⛔ Kev txiav txim",
  "Đăng ký thành công.": "Sau npe tiav lawm.",
  "Đăng nhập thành công.": "Nkag mus tiav lawm.",
  "Thông báo từ Trạm Có Lúa": "Ceeb toom ntawm Trạm Có Lúa",
  "Trạng thái tài khoản và yêu cầu rút tiền.": "Xwm txheej as khauj thiab kev thov rho nyiaj.",
  "Tình trạng rút tiền hiện tại": "Xwm txheej rho nyiaj tam sim no",
  "Đóng báo cáo": "Kaw daim ntawv qhia",
  "Xem chi tiết": "Saib kom meej",
  "Tìm": "Nrhiav",
  "Tất cả": "Tag nrho",
  "Tên nhiệm vụ": "Npe haujlwm",
  "Trạng thái": "Xwm txheej",
  "Thao tác": "Kev ua",
  "Thời gian": "Lub sijhawm",
  "Nội dung": "Cov ntsiab lus",
  "Thưởng": "Nqi zog",
  "Số dư": "Qhov tshuav",
  "IP đăng ký": "IP sau npe",
  "Tài khoản": "Tus as khauj",
  "Mở khóa": "Qhib dua",
  "Chưa có dữ liệu": "Tseem tsis tau muaj ntaub ntawv",
  "Chính sách dữ liệu · Trạm Có Lúa": "Txoj cai ntaub ntawv · Trạm Có Lúa",
  "Điều khoản sử dụng · Trạm Có Lúa": "Cov nqe lus siv · Trạm Có Lúa",
  "← Trở về website": "← Rov mus rau lub vev xaib",
  "1. Dữ liệu được thu thập": "1. Cov ntaub ntawv sau tseg",
  "2. Mục đích xử lý": "2. Lub hom phiaj siv ntaub ntawv",
  "3. Nơi lưu trữ và quyền truy cập": "3. Qhov chaw khaws thiab leej twg nkag tau",
  "4. Thời gian lưu giữ": "4. Lub sijhawm khaws ntaub ntawv",
  "5. Quyền của thành viên": "5. Cov tswv cuab txoj cai",
  "6. Thông tin liên hệ": "6. Kev tiv tauj",
  "1. Tài khoản và nhiệm vụ": "1. As khauj thiab cov haujlwm",
  "2. Lúa và giá trị quy đổi": "2. Lúa thiab kev pauv",
  "3. Chống gian lận": "3. Tiv thaiv kev dag",
  "4. Quy định chi trả": "4. Cov cai them nyiaj",
  "5. Đơn vị vận hành và liên hệ": "5. Tus tswj lub vev xaib thiab kev tiv tauj",
  "Thông tin thanh toán, Lúa và an toàn lấy trực tiếp từ hệ thống.": "Cov ntaub ntawv them nyiaj, Lúa, thiab kev nyab xeeb los ntawm lub tshuab tiag.",
  "Danh sách nhiệm vụ": "Daim ntawv teev cov haujlwm",
  "Không có nhiệm vụ": "Tsis muaj haujlwm",
  "Hiện chưa có nhiệm vụ": "Tam sim no tsis muaj haujlwm",
  "Admin cần tạo và bật nhiệm vụ thật. Website không tự thêm nhiệm vụ hoặc số Lúa giả.": "Tus tswj hwm yuav tsum tsim thiab qhib cov haujlwm tiag. Lub vev xaib tsis tsim cov haujlwm lossis Lúa cuav.",
  "Bắt đầu nhiệm vụ →": "Pib txoj haujlwm →",
  "Khác": "Lwm yam",
  "Kiểm tra tự động": "Kuaj tsis siv neeg",
  "Admin duyệt bằng chứng": "Admin kuaj pov thawj",
  "Mỗi ngày 1 lượt": "Ib zaug txhua hnub",
  "Mỗi tài khoản 1 lượt": "Ib zaug rau ib as khauj",
  "Mã giới thiệu:": "Tus lej caw:",
  "Sao chép mã": "Luam tus lej",
  "Sao chép liên kết": "Luam qhov txuas",
  "Sao chép IP kết nối": "Luam IP txuas",
  "Kiểm tra IPv4": "Tshawb IPv4",
  "Thông tin IP": "Cov ntaub ntawv IP",
  "IPv4 công khai": "IPv4 rau sawv daws",
  "IPv6 công khai": "IPv6 rau sawv daws",
  "Chưa xác định IP": "Tseem tsis paub IP",
  "IP hiện tại:": "IP tam sim no:",
  "IP kết nối:": "IP txuas:",
  "📱 Đã định danh thiết bị:": "📱 Tus lej browser teev tseg:",
  "📱 Đã định danh thiết bị": "📱 Tus lej browser teev tseg",
  "🛡️ Bảo vệ chống gian lận": "🛡️ Tiv thaiv kev dag",
  "✓ ADMIN XÁC NHẬN ĐÃ CHUYỂN": "✓ ADMIN POM ZOO THEM LAWM",
  "↗ THÔNG BÁO THANH TOÁN": "↗ CEEB TOOM THEM NYIAJ",
  "Chưa có khoản rút nào được Admin xác nhận đã chuyển.": "Tseem tsis muaj kev rho nyiaj uas Admin lees tias them lawm.",
  "Không sử dụng giao dịch minh họa.": "Tsis siv kev lag luam piv txwv.",
  "☑ TỔNG LÚA LINK ĐÃ DUYỆT": "☑ TAG NRHO LÚA LINK TAU POM ZOO",
  "✓ NHIỆM VỤ ĐÃ GỬI HÔM NAY": "✓ COV HAUJLWM XA HNUB NO",
  "↻ ĐỔI NGÀY SAU": "↻ HLOOV HNUB TOM NTEJ",
  "Mỗi Lúa đều có nguồn gốc rõ ràng, được lưu vào lịch sử.": "Txhua Lúa muaj qhov twg los meej thiab raug khaws rau keeb kwm.",
  "Tham gia nhiệm vụ và theo dõi số dư của bạn. Phần thưởng chỉ phát sinh từ nhiệm vụ hợp lệ.": "Koom cov haujlwm thiab saib koj qhov tshuav. Tsuas tau nqi zog rau haujlwm uas raug lees paub.",
  "Chào mừng đến với nền tảng. Theo dõi thông báo từ quản trị viên tại đây.": "Zoo siab txais tos rau lub vev xaib. Saib cov lus tshaj tawm ntawm Admin ntawm no.",
  "Mã do website lưu trên trình duyệt nếu được cho phép. Đây không phải IMEI và có thể bị xóa hoặc thay đổi.": "Tus lej no khaws hauv browser thaum tso cai. Tsis yog IMEI thiab yeej hloov lossis rho tawm tau.",
  "Mời người khác đăng ký. Thưởng giới thiệu được tính sau khi họ hoàn thành nhiệm vụ hợp lệ.": "Caw lwm tus sau npe. Tau nqi zog caw thaum lawv ua haujlwm raug cai tiav.",
  "Dùng liên kết này để giới thiệu thành viên mới:": "Siv qhov txuas no caw cov tswv cuab tshiab:",
  "Chưa có ai đăng ký qua liên kết của bạn.": "Tseem tsis tau muaj leej twg sau npe ntawm koj qhov txuas.",
  "Quà điểm danh hằng ngày theo cấu hình thực tế của Admin.": "Khoom plig kos npe txhua hnub nyob ntawm Admin teeb.",
  "Điểm danh ngay": "Kos npe tam sim no",
  "Hệ thống tự kiểm tra lượt đã nhận để ngăn ghi Lúa trùng lặp. Admin có thể điều chỉnh mức quà.": "Lub tshuab kuaj cov nqi zog twb tau txais kom tsis txhob txais ob zaug. Admin hloov tau tus nqi.",
  "Nếu mức thưởng đang bằng 0, thao tác điểm danh vẫn được lưu nhưng không phát sinh Lúa.": "Yog khoom plig yog 0, kev kos npe yuav raug teev tab sis tsis tau Lúa.",
  "Theo dõi: Đang chờ → Đã duyệt → Đã thanh toán. Admin kiểm tra và chi trả bằng ngân hàng hoặc ZaloPay.": "Saib xwm txheej: Tos → Pom zoo → Them lawm. Admin kuaj thiab them ntawm txhab nyiaj lossis ZaloPay.",
  "⚠ Admin chưa mở chi trả hoặc chưa thiết lập tỷ giá Lúa/VNĐ. Bạn chưa thể tạo yêu cầu rút tiền.": "⚠ Admin tseem tsis tau qhib kev them lossis teeb tus nqi pauv Lúa/VNĐ. Koj tsis tau thov rho nyiaj.",
  "Số Lúa muốn rút": "Pes tsawg Lúa xav rho",
  "Phương thức nhận tiền": "Txoj kev txais nyiaj",
  "Chuyển khoản ngân hàng": "Hloov nyiaj hauv txhab nyiaj",
  "Ví ZaloPay": "Hnab ZaloPay",
  "Nhập tên ngân hàng khác": "Sau lwm lub npe txhab nyiaj",
  "Số tài khoản ngân hàng (chỉ chữ số)": "Tus lej as khauj txhab nyiaj (naj npawb xwb)",
  "Tên chủ tài khoản ngân hàng": "Tus tswv as khauj txhab nyiaj",
  "Số điện thoại đăng ký ZaloPay": "Xov tooj sau npe ZaloPay",
  "Tên chủ ví ZaloPay": "Tus tswv hnab ZaloPay",
  "Gửi yêu cầu": "Xa daim ntawv thov",
  "Chưa có tỷ giá": "Tseem tsis muaj tus nqi pauv",
  "Lịch sử yêu cầu rút": "Keeb kwm thov rho nyiaj",
  "Giá trị VNĐ": "Tus nqi VNĐ",
  "Nhận qua": "Txais ntawm",
  "Ghi chú": "Lus sau ntxiv",
  "Số Lúa": "Pes tsawg Lúa",
  "Thay đổi Lúa": "Lúa hloov",
  "Thông tin đăng nhập và bảo mật tài khoản.": "Cov ntaub ntawv nkag mus thiab kev nyab xeeb as khauj.",
  "Tên:": "Npe:",
  "Email:": "Email:",
  "Vai trò:": "Lub luag haujlwm:",
  "Tham gia:": "Hnub koom:",
  "IP truy cập:": "IP siv:",
  "Mật khẩu hiện tại": "Lo lus zais tam sim no",
  "Mật khẩu mới (≥10 ký tự)": "Lo lus zais tshiab (tsawg kawg 10 cim)",
  "Chỉ khi duyệt thành công, Lúa mới được ghi vào ví thành viên.": "Tsuas ntxiv Lúa thaum pov thawj raug pom zoo.",
  "Bằng chứng": "Pov thawj",
  "Kiểm tra": "Tshawb xyuas",
  "Duyệt": "Pom zoo",
  "Sửa": "Kho",
  "Tạo nhiệm vụ": "Tsim haujlwm",
  "Lưu chỉnh sửa": "Khaws kev hloov",
  "Tạo mới": "Tsim tshiab",
  "Bật công khai": "Qhib rau sawv daws",
  "Tắt / nháp": "Kaw / sau cia",
  "Mỗi người một lần": "Ib zaug rau ib tug",
  "Mỗi ngày một lần": "Ib zaug txhua hnub",
  "Lặp lại": "Rov ua dua",
  "Thưởng (Lúa)": "Nqi zog (Lúa)",
  "Thời gian tối thiểu cho Video (giây)": "Lub sijhawm tsawg kawg rau Video (vib nas this)",
  "Nhiệm vụ đã tạo": "Cov haujlwm tsim lawm",
  "Tra cứu tài khoản, số Lúa và tình trạng sử dụng.": "Nrhiav cov as khauj, Lúa tshuav thiab xwm txheej siv.",
  "Thêm, sửa và bật/tắt nhiệm vụ bất kỳ lúc nào.": "Tsim, kho, qhib lossis kaw cov haujlwm txhua lub sijhawm.",
  "Đã gửi ảnh": "Tau xa duab",
  "Không ghi chú": "Tsis muaj lus sau",
  "Xem ảnh bằng chứng": "Saib daim duab pov thawj",
  "Không tải được dữ liệu:": "Thauj tsis tau cov ntaub ntawv:",
  "Tài khoản / Trạng thái": "As khauj / Xwm txheej",
  "Điểm / Mức độ": "Qhab nia / Qib",
  "IP và mã trình duyệt": "IP thiab tus lej browser",
  "Liên quan / Chi tiết": "Kev txuas / Nthuav",
  "Tìm tên hoặc email thành viên": "Nrhiav npe lossis email tswv cuab",
  "Tìm tài khoản": "Nrhiav as khauj",
  "Cần kiểm tra": "Yuav tsum kuaj",
  "Mức thấp": "Qib tsawg",
  "Nhiều tài khoản cùng mã trình duyệt": "Ntau as khauj siv tib tus lej browser",
  "Địa chỉ IPv4": "Chaw nyob IPv4",
  "Nguồn ghi nhận": "Qhov chaw muab ntaub ntawv",
  "Gần nhất": "Tsis ntev no",
  "Địa chỉ / Nguồn": "Chaw nyob / Chaw muab",
  "Tài khoản / Thiết bị": "As khauj / Cuab yeej",
  "Mức độ": "Qib",
  "Chưa đủ bằng chứng để kết luận": "Pov thawj tseem tsis txaus",
  "Ưu tiên đối chiếu bằng chứng": "Tshuaj xyuas pov thawj ua ntej",
  "Kết nối máy chủ (xác thực)": "Lub server teev tseg (tau lees)",
  "Trình duyệt báo (chưa xác minh)": "Browser tshaj (tseem tsis tau lees)",
  "Trạng thái do Admin cập nhật, không phải xác nhận tự động từ ngân hàng.": "Admin hloov xwm txheej no, tsis yog lub txhab nyiaj lees nws tus kheej."
};
 const originals=new WeakMap();
 const attributes=new WeakMap();
 const AVAILABLE=new Set(['vi','hmn']);
 function currentLanguage(){
  try{return localStorage.getItem(STORAGE_KEY)==='hmn'?'hmn':'vi';}
  catch{return 'vi';}
 }
 let language=currentLanguage();
 function translation(v){
  if(Object.prototype.hasOwnProperty.call(translations,v))return translations[v];
  // Câu có tên/số dư được ghép từ dữ liệu thật; chỉ dịch phần giao diện.
  let match=/^Xin chào, (.*) 👋$/.exec(v);
  if(match)return 'Nyob zoo, '+match[1]+' 👋';
  match=/^([\d.,]+) Lúa hiện có$/.exec(v);
  if(match)return 'Muaj '+match[1]+' Lúa';
  match=/^Nhiệm vụ đã tạo \(([\d.,]+)\)$/.exec(v);
  if(match)return 'Cov haujlwm tsim lawm ('+match[1]+')';
  return null;
 }
 function translateText(node){
  const parent=node.parentElement;
  if(!parent||parent.closest('script,style,textarea,code,pre,[contenteditable="true"],.captcha'))return;
  let original=originals.get(node);
  if(original===undefined){
   original=node.nodeValue;
   // Không lưu vào WeakMap nếu đây là văn bản động/chưa có bản dịch.
   if(translation(original.trim())===null)return;
   originals.set(node,original);
  }
  const stripped=original.trim();
  const value=language==='hmn'?translation(stripped):stripped;
  if(value===null)return;
  const result=original.replace(stripped,value);
  if(node.nodeValue!==result)node.nodeValue=result;
 }
 function translateAttributes(el){
  if(el.nodeType!==1)return;
  const names=['placeholder','aria-label','title'];
  let original=attributes.get(el);
  for(const name of names){
   if(!el.hasAttribute(name))continue;
   const value=original?.[name]??el.getAttribute(name);
   const translated=translation(value);
   if(translated===null)continue;
   if(!original){original={};attributes.set(el,original);}
   if(original[name]===undefined)original[name]=value;
   const result=language==='hmn'?translated:value;
   if(el.getAttribute(name)!==result)el.setAttribute(name,result);
  }
 }
 function translateTree(root){
  if(!root)return;
  if(root.nodeType===3){translateText(root);return;}
  if(root.nodeType!==1&&root.nodeType!==9&&root.nodeType!==11)return;
  if(root.nodeType===1)translateAttributes(root);
  const elements=root.querySelectorAll?.('[placeholder],[aria-label],[title]')||[];
  for(const el of elements)translateAttributes(el);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;while((node=walker.nextNode()))translateText(node);
  // Cập nhật trạng thái của cả nút vừa được tạo bởi ứng dụng.
  const buttons=root.querySelectorAll?.('[data-language]')||[];
  if(root.matches?.('[data-language]'))updateButton(root);
  for(const b of buttons)updateButton(b);
 }
 function updateButton(button){
  const active=button.dataset.language===language;
  button.classList.toggle('selected',active);
  button.setAttribute('aria-pressed',String(active));
 }
 function setLanguage(value){
  if(!AVAILABLE.has(value))return;
  language=value;
  try{localStorage.setItem(STORAGE_KEY,value);}catch{}
  document.documentElement.lang=language;
  translateTree(document.body);
  // Không điều hướng; tài khoản, biểu mẫu và trang đang mở được giữ nguyên.
  document.dispatchEvent(new CustomEvent('tramco:language-changed',{detail:{language}}));
 }
 function onReady(){
  document.documentElement.lang=language;
  document.addEventListener('click',e=>{
   const button=e.target.closest('[data-language]');
   if(!button)return;
   e.preventDefault();
   setLanguage(button.dataset.language);
  });
  translateTree(document.body);
  const observer=new MutationObserver(mutations=>{
   for(const change of mutations){
    for(const node of change.addedNodes)translateTree(node);
   }
  });
  observer.observe(document.body,{childList:true,subtree:true});
 }
 window.TramI18n={getLanguage:()=>language,setLanguage,translateTree};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onReady,{once:true});
 else onReady();
})();
