# Thiệp Cưới Online — Bản ReactJS

Bản chuyển đổi sang **ReactJS + Vite** của hệ thống thiệp cưới online (bản gốc HTML/CSS/JavaScript thuần, artifact `thiep-cuoi-online`). Giữ nguyên giao diện, bố cục và hành vi của bản gốc: tông hồng phấn / trắng kem, font Noto Serif / Dancing Script / Be Vietnam Pro, màu chủ đạo `#b76e79`.

## Tính năng

- **Thiệp công khai một trang** (`/`): hero slideshow + đếm ngược tới 14/02/2027, Cặp đôi, Album masonry + lightbox, Sự kiện cưới (thêm vào Google Calendar / tải file .ics), Video YouTube, **Mừng cưới** (2 thẻ chú rể/cô dâu, mã QR SVG sinh nội tuyến, nút sao chép số tài khoản), Sổ lưu bút dạng slider vuốt/kéo, form RSVP, nhạc nền tự phát sau tương tác đầu.
- **Trang RSVP riêng** (`/rsvp.html`): form xác nhận tham dự, validate tên + SĐT Việt Nam, chặn trùng SĐT, chặn khi quá hạn RSVP (01/02/2027).
- **Dashboard quản trị** (`/admin/`, đăng nhập tại `/admin/login.html`): đủ **14 mục** — Tổng quan, Thông tin chung, Cô dâu & Chú rể, Mừng cưới, Album ảnh, Sự kiện cưới, Video, Nhạc nền, Giao diện, Sổ lưu bút, RSVP / Khách mời, SEO & Chia sẻ, Sao lưu & Dữ liệu, Cài đặt tài khoản. Kèm Live Preview 3 chế độ (máy tính / máy tính bảng / điện thoại).
- **Dữ liệu**: cấu hình, lời chúc, RSVP lưu trên **Cloud Firestore**; ảnh tải từ dashboard được nén rồi upload lên **Cloudinary** trong folder `wedding`. Không cần Firebase Storage.
- **Đăng nhập admin**: Firebase Authentication (email/mật khẩu). Firestore Rules giới hạn cấu hình và dữ liệu riêng tư RSVP cho UID quản trị.
- **Mobile**: ảnh nền hero cố định khi cuộn (dùng `position: fixed` + `clip-path`, vì `background-attachment: fixed` không có tác dụng trên trình duyệt điện thoại); mục Mừng cưới luôn xếp 2 thẻ trên 1 hàng kể cả trên mobile.

## Yêu cầu

- Node.js 18+ (đã kiểm chứng với Node v24.22.1) và npm.

## Chạy

### Danh sách mừng cưới từ Excel

Trong admin, mở **Danh sách mừng cưới** → **Tải file Excel lên** (`.xlsx`, `.xls`, `.csv`) → chọn sheet/dòng tiêu đề → **Lưu danh sách**. Bảng lấy nội dung cột và giá trị đã định dạng trong Excel, có tìm kiếm/phân trang. Công thức dùng giá trị được Excel lưu gần nhất; mở và lưu lại file trong Excel trước khi nhập nếu kết quả công thức chưa được cập nhật. File mới thay thế danh sách cũ sau khi lưu thành công. Không sao chép style/ô gộp của Excel sang giao diện bảng.

Dữ liệu nằm riêng tại `adminData/weddingGifts` và `weddingGiftImports`, chỉ UID admin được đọc/ghi. Publish bản `firestore.rules` mới để bật quyền cho mục này. Hỗ trợ tối đa 10 MB/file, 10.000 dòng, 100 cột và 5 MB dữ liệu nhập; các bảng lớn được chia thành nhiều document để tránh giới hạn 1 MB/document của Firestore.

Ứng dụng dùng React Router với các URL `/`, `/rsvp`, `/admin`, `/admin/login`. Truy cập trực tiếp `/admin` để đăng nhập/quản trị; trang công khai không có nút Quản trị.

### Upload và xoá ảnh Cloudinary

- Chọn ảnh chỉ xem trước trên máy; bấm **Lưu thay đổi** mới upload.
- Xoá ảnh chỉ thay đổi bản nháp. Khi bấm **Lưu thay đổi**, app lưu cấu hình Firestore thành công rồi gọi API xoá những ảnh Cloudinary không còn được sử dụng trong cấu hình. Hoàn tác trước khi lưu không xoá ảnh trên cloud.
- API `api/cloudinary/delete.js` xác thực Firebase ID token và UID admin, chỉ xoá ảnh thuộc folder `wedding`. API secret luôn ở máy chủ.
- `npm run dev` chạy API qua middleware Vite. Khi production, có sẵn Vercel Function và cấu hình SPA trong `vercel.json`: deploy cả repository lên Vercel, không chỉ upload thư mục `dist`.
- Khai báo biến môi trường phía máy chủ trên Vercel: `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `FIREBASE_ADMIN_UID`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_FIREBASE_PROJECT_ID`; cùng các biến frontend trong `.env.example`.
- Firebase Hosting thuần tĩnh chỉ phục vụ giao diện và các route; muốn xoá Cloudinary khi dùng host khác cần triển khai API Node này trên backend tương ứng. Không đưa API secret vào frontend để thay thế API.

```bash
npm install      # cài đặt dependencies
npm run dev      # chạy dev server (mặc định http://localhost:5173)
npm run build    # build production ra thư mục dist/
npm run preview  # xem thử bản build (http://localhost:4173)
```

Sau khi build, toàn bộ thư mục `dist/` là web tĩnh — up lên bất kỳ host tĩnh nào (Netlify, Vercel, GitHub Pages, Firebase Hosting…) là chạy.

## Kết nối Firebase

Ứng dụng đọc cấu hình Firebase từ `.env` qua `src/lib/firebase.js`. File `.env` đã được bỏ qua bởi Git; `.env.example` là mẫu để cấu hình môi trường mới. Sao chép `.env.example` thành `.env`, điền Firebase Web config từ Firebase Console → Project settings → Your apps, rồi khởi động lại Vite. Khi deploy, khai báo cùng các biến `VITE_FIREBASE_*` ở môi trường build. Firebase config và API key nằm trong frontend nên không phải bí mật; bảo mật dữ liệu dựa vào Authentication và Rules, không dựa vào việc giấu API key.

1. Trong Firebase Console, bật **Authentication → Sign-in method → Email/Password**, sau đó vào **Users → Add user** để tạo tài khoản admin. Trang đăng nhập không cho khách tự đăng ký.
2. Tạo **Cloud Firestore database** cho project.
3. Trong **Cloudinary**, cấu hình preset unsigned `wedding_unsigned` (chỉ ảnh, folder `wedding`). Preset hiện đã được tạo cho cloud `doslcoy82`; dashboard dùng preset này để upload trực tiếp, API secret không được gửi xuống trình duyệt.
4. Sao chép nội dung `firestore.rules` vào **Firestore → Rules** và bấm **Publish**. UID admin trong file cần khớp tài khoản ở **Authentication → Users**.
5. Đưa domain website vào **Authentication → Settings → Authorized domains** nếu dùng domain riêng; chạy `npm install` rồi `npm run dev` để thử.
6. Khi deploy, khai báo các biến `VITE_FIREBASE_*`, `VITE_CLOUDINARY_CLOUD_NAME` và `VITE_CLOUDINARY_UPLOAD_PRESET` trong môi trường build. Không đưa `CLOUDINARY_API_SECRET` vào biến có tiền tố `VITE_`.
7. Đăng nhập `/admin/login.html`. Dashboard sẽ đồng bộ cấu hình, lời chúc và RSVP lên Firestore; ảnh được upload vào Cloudinary.

Rules cho phép khách gửi lời chúc và RSVP nhưng chỉ admin được xem danh sách RSVP (có email/SĐT), duyệt/xoá lời chúc và sửa cấu hình. Lời nhắn kèm RSVP được ghi cùng RSVP và tự duyệt vào sổ lưu bút. RSVP có SĐT dùng SĐT làm document ID để ngăn gửi trùng; nếu không có SĐT, app dùng ID tự sinh. Quyền đọc Firestore vẫn bị giới hạn cho admin.

## Cấu trúc thư mục

```
.
├── index.html            # entry: thiệp công khai
├── rsvp.html             # entry: trang RSVP
├── admin/
│   ├── index.html        # entry: dashboard quản trị
│   └── login.html        # entry: trang đăng nhập admin
├── public/
│   ├── config.json       # config mặc định (1 object duy nhất)
│   ├── assets/
│   │   └── README.md     # lưu ý về file nhạc nền (xem dưới)
│   └── js/
│       └── qrcode-generator.js   # thư viện sinh mã QR (dùng chung)
├── src/
│   ├── main.jsx          # entry React: thiệp công khai
│   ├── rsvp.jsx          # entry React: trang RSVP
│   ├── admin.jsx         # entry React: dashboard
│   ├── login.jsx         # entry React: đăng nhập admin
│   ├── lib/
│   │   ├── defaultConfig.js  # config mặc định (đồng bộ với config.json)
│   │   ├── store.js          # tầng dữ liệu Firestore (getConfig/saveConfig/…)
│   │   ├── auth.js           # phiên đăng nhập admin (an toàn khi storage bị chặn)
│   │   ├── sha256.js         # SHA-256 (WebCrypto + fallback JS thuần)
│   │   ├── qr.js             # sinh QR SVG từ thông tin ngân hàng
│   │   ├── utils.js          # tiện ích (ngày giờ, Google Calendar, .ics…)
│   │   └── icons.jsx         # bộ icon SVG dùng chung
│   ├── components/
│   │   ├── common.jsx        # useConfig, applyTheme, Toast…
│   │   ├── Guestbook.jsx     # slider lời chúc (vuốt/kéo, tự chạy 5s/trang)
│   │   └── RsvpForm.jsx      # form RSVP + validate
│   ├── pages/
│   │   ├── PublicPage.jsx    # thiệp công khai
│   │   ├── RsvpPage.jsx      # trang RSVP
│   │   ├── AdminDashboard.jsx# dashboard 14 mục
│   │   └── AdminLogin.jsx    # đăng nhập / đặt mật khẩu lần đầu
│   └── styles/
│       ├── site.css          # CSS thiệp + RSVP
│       └── admin.css         # CSS dashboard + đăng nhập
└── vite.config.js        # cấu hình multi-page (4 entry)
```

## Lưu ý

- **File nhạc nền đã có sẵn.** Config trỏ tới `assets/beautiful-in-white.mp3` (nhạc "Beautiful in White" — Shane Filan), file MP3 (5,4 MB) đã kèm trong `public/assets/` và có mặt trong bản build `dist/assets/` nên nhạc phát được ngay sau khi deploy, không cần copy thêm.
- **Ảnh mẫu** trong album/hero đang dùng `picsum.photos` (cần mạng để tải); thay bằng ảnh thật trong dashboard → Album ảnh / Thông tin chung.
- Nếu Firebase chưa được tạo hoặc Rules chưa publish, các thao tác lưu/tải dữ liệu cloud sẽ báo lỗi; hãy hoàn thành các bước cấu hình Firebase ở trên.
- **Khác biệt nhỏ so với bản gốc** (do React không dùng được đúng thư viện cũ):
  - Cắt ảnh (Cropper.js) → tự động center-crop bằng canvas đúng tỉ lệ (16:9 hero, 1:1 chân dung, 1.91:1 og).
  - Kéo-thả sắp xếp (SortableJS) → kéo-thả HTML5 native.
  - Biểu đồ RSVP (Chart.js) → biểu đồ donut vẽ bằng SVG.
  - Mã QR thiệp (CDN `QRCode.toDataURL`) → sinh SVG bằng `qrcode-generator` đã có sẵn.
  - Checklist Tổng quan: mục "chuyện tình yêu" đổi thành "đã nhập thông tin mừng cưới" (mục Chuyện tình yêu đã bỏ theo yêu cầu).
- **Build**: đã kiểm chứng `npm run build` thành công, 4 trang render đủ nội dung, không lỗi JavaScript (kiểm bằng jsdom + bundle IIFE). Cảnh báo duy nhất khi build (`new URL('../config.json', import.meta.url)`) là vô hại — đường dẫn này được resolve lúc chạy.

## Giấy phép

Dữ liệu mẫu (tên "Tên Chú Rể" / "Tên Cô Dâu", số tài khoản mẫu, ảnh picsum) chỉ để demo — thay bằng thông tin thật trước khi dùng.
