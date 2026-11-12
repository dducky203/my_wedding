# Thiệp Cưới Online — Bản ReactJS

Bản chuyển đổi sang **ReactJS + Vite** của hệ thống thiệp cưới online (bản gốc HTML/CSS/JavaScript thuần, artifact `thiep-cuoi-online`). Giữ nguyên giao diện, bố cục và hành vi của bản gốc: tông hồng phấn / trắng kem, font Noto Serif / Dancing Script / Be Vietnam Pro, màu chủ đạo `#b76e79`.

## Tính năng

- **Thiệp công khai một trang** (`/`): hero slideshow + đếm ngược tới 14/02/2027, Cặp đôi, Album masonry + lightbox, Sự kiện cưới (thêm vào Google Calendar / tải file .ics), Video YouTube, **Mừng cưới** (2 thẻ chú rể/cô dâu, mã QR SVG sinh nội tuyến, nút sao chép số tài khoản), Sổ lưu bút dạng slider vuốt/kéo, form RSVP, nhạc nền tự phát sau tương tác đầu.
- **Trang RSVP riêng** (`/rsvp.html`): form xác nhận tham dự, validate tên + SĐT Việt Nam, chặn trùng SĐT, chặn khi quá hạn RSVP (01/02/2027).
- **Dashboard quản trị** (`/admin/`, đăng nhập tại `/admin/login.html`): đủ **14 mục** — Tổng quan, Thông tin chung, Cô dâu & Chú rể, Mừng cưới, Album ảnh, Sự kiện cưới, Video, Nhạc nền, Giao diện, Sổ lưu bút, RSVP / Khách mời, SEO & Chia sẻ, Sao lưu & Dữ liệu, Cài đặt tài khoản. Kèm Live Preview 3 chế độ (máy tính / máy tính bảng / điện thoại).
- **Dữ liệu**: cấu hình, lời chúc, RSVP lưu trên **Cloud Firestore**; ảnh tải từ dashboard lưu trên **Firebase Storage**. Không cần tự viết backend.
- **Đăng nhập admin**: Firebase Authentication (email/mật khẩu). Firestore Rules giới hạn cấu hình và dữ liệu riêng tư RSVP cho UID quản trị.
- **Mobile**: ảnh nền hero cố định khi cuộn (dùng `position: fixed` + `clip-path`, vì `background-attachment: fixed` không có tác dụng trên trình duyệt điện thoại); mục Mừng cưới luôn xếp 2 thẻ trên 1 hàng kể cả trên mobile.

## Yêu cầu

- Node.js 18+ (đã kiểm chứng với Node v24.22.1) và npm.

## Chạy

```bash
npm install      # cài đặt dependencies
npm run dev      # chạy dev server (mặc định http://localhost:5173)
npm run build    # build production ra thư mục dist/
npm run preview  # xem thử bản build (http://localhost:4173)
```

Sau khi build, toàn bộ thư mục `dist/` là web tĩnh — up lên bất kỳ host tĩnh nào (Netlify, Vercel, GitHub Pages, Firebase Hosting…) là chạy.

## Kết nối Firebase

Ứng dụng đã cấu hình Firebase project `my-wedding-28f9d` trong `src/lib/firebase.js`. Firebase config và API key nằm trong frontend nên không phải bí mật; bảo mật dữ liệu dựa vào Authentication và Rules, không dựa vào việc giấu API key.

1. Trong Firebase Console, bật **Authentication → Sign-in method → Email/Password**, sau đó vào **Users → Add user** để tạo tài khoản admin. Trang đăng nhập không cho khách tự đăng ký.
2. Tạo **Cloud Firestore database** và **Storage bucket** cho project.
3. Sao chép UID của tài khoản admin vừa tạo. Thay `REPLACE_WITH_ADMIN_UID` trong cả `firestore.rules` và `storage.rules` bằng UID đó.
4. Sao chép nội dung `firestore.rules` vào **Firestore → Rules** và bấm **Publish**. Tương tự, đưa `storage.rules` vào **Storage → Rules** rồi **Publish**.
5. Đưa domain website vào **Authentication → Settings → Authorized domains** nếu dùng domain riêng; chạy `npm install` rồi `npm run dev` để thử.
6. Đăng nhập `/admin/login.html`. Dashboard sẽ đồng bộ cấu hình, lời chúc, RSVP và ảnh lên Firebase.

Rules cho phép khách gửi lời chúc và RSVP nhưng chỉ admin được xem danh sách RSVP (có email/SĐT), duyệt/xoá lời chúc và sửa cấu hình. RSVP dùng SĐT làm document ID để ngăn gửi trùng; quyền đọc Firestore vẫn bị giới hạn cho admin. Theo dõi quota và chi phí Firestore/Storage trong Firebase Console.

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
│   │   ├── store.js          # tầng dữ liệu localStorage (getConfig/saveConfig/…)
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
