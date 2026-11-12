/**
 * defaultConfig.js — Dữ liệu MẪU (giả lập) cho thiệp cưới (bản React).
 * Mọi nội dung hiển thị trên thiệp đều lấy từ object DEFAULT_CONFIG này
 * (hoặc bản đã lưu trong localStorage / file config.json).
 * Tuyệt đối KHÔNG hard-code tên người thật, địa chỉ thật trong code.
 */
export const DEFAULT_CONFIG = {
  "version": 1,
  "site": {
    "domain": "",
    "title": "Tên Chú Rể & Tên Cô Dâu — Thiệp Cưới Online",
    "metaDescription": "Trân trọng kính mời bạn đến dự lễ cưới của Tên Chú Rể & Tên Cô Dâu.",
    "ogImage": "https://picsum.photos/seed/wedding-og/1200/630"
  },
  "couple": {
    "order": "groomFirst",
    "monogram": "T & T",
    "groom": {
      "name": "Tên Chú Rể",
      "father": "Ông Nguyễn Văn An",
      "mother": "Bà Trần Thị Bình",
      "bio": "Chú rể là người hiền lành, chân thành và luôn hết lòng vì gia đình. Anh tin rằng hạnh phúc đơn giản là mỗi ngày được cùng nhau ăn một bữa cơm ấm cúng.",
      "photo": "https://picsum.photos/seed/groom/600/600",
      "showParents": true
    },
    "bride": {
      "name": "Tên Cô Dâu",
      "father": "Ông Lê Văn Cường",
      "mother": "Bà Phạm Thị Dung",
      "bio": "Cô dâu là người dịu dàng, yêu hoa và thích những điều giản dị. Cô tin rằng tình yêu đẹp nhất là khi hai người cùng nhau lớn lên mỗi ngày.",
      "photo": "https://picsum.photos/seed/bride/600/600",
      "showParents": true
    },
    "tagline": "We're getting married",
    "slogan": "Tình yêu không phải là nhìn nhau, mà là cùng nhau nhìn về một hướng.",
    "ctaText": "Xác nhận tham dự",
    "weddingDate": "2027-02-14T09:00:00+07:00",
    "heroImages": [
      "https://picsum.photos/seed/wedding-hero-1/1600/900",
      "https://picsum.photos/seed/wedding-hero-2/1600/900",
      "https://picsum.photos/seed/wedding-hero-3/1600/900"
    ],
    "heroSlideshow": true
  },
  "gift": {
    "enabled": true,
    "title": "Mừng Cưới",
    "subtitle": "Sự hiện diện của bạn là món quà quý giá nhất. Nếu bạn muốn gửi quà mừng, có thể chuyển khoản tới một trong hai tài khoản dưới đây:",
    "groom": {
      "bank": "Vietcombank (ngân hàng mẫu)",
      "accountNumber": "0123456789",
      "accountName": "TEN CHU RE",
      "qrImage": "assets/qr-groom.png"
    },
    "bride": {
      "bank": "Vietcombank (ngân hàng mẫu)",
      "accountNumber": "9876543210",
      "accountName": "TEN CO DAU",
      "qrImage": "assets/qr-bride.png"
    }
  },
  "album": {
    "enabled": true,
    "title": "Album Hình Cưới",
    "subtitle": "Những khoảnh khắc ngọt ngào nhất của chúng mình",
    "columns": 3,
    "photos": [
      {
        "id": "photo-1",
        "src": "https://picsum.photos/seed/album-1/800/1067",
        "caption": "Nắng vàng ngày cưới",
        "cover": true
      },
      {
        "id": "photo-2",
        "src": "https://picsum.photos/seed/album-2/800/1000",
        "caption": "Nụ cười của em",
        "cover": false
      },
      {
        "id": "photo-3",
        "src": "https://picsum.photos/seed/album-3/1000/750",
        "caption": "Tay trong tay",
        "cover": false
      },
      {
        "id": "photo-4",
        "src": "https://picsum.photos/seed/album-4/800/1000",
        "caption": "Hoàng hôn bên biển",
        "cover": false
      },
      {
        "id": "photo-5",
        "src": "https://picsum.photos/seed/album-5/900/900",
        "caption": "Cùng nhau đi khắp thế gian",
        "cover": false
      },
      {
        "id": "photo-6",
        "src": "https://picsum.photos/seed/album-6/800/1067",
        "caption": "Khoảnh khắc ngọt ngào",
        "cover": false
      },
      {
        "id": "photo-7",
        "src": "https://picsum.photos/seed/album-7/800/1000",
        "caption": "Em là nhà",
        "cover": false
      },
      {
        "id": "photo-8",
        "src": "https://picsum.photos/seed/album-8/1000/750",
        "caption": "Mãi mãi về sau",
        "cover": false
      },
      {
        "id": "photo-9",
        "src": "https://picsum.photos/seed/album-9/800/1067",
        "caption": "Bản tình ca mùa thu",
        "cover": false
      },
      {
        "id": "photo-10",
        "src": "https://picsum.photos/seed/album-10/800/1000",
        "caption": "Bên nhau trọn đời",
        "cover": false
      },
      {
        "id": "photo-11",
        "src": "https://picsum.photos/seed/album-11/900/900",
        "caption": "Nụ hôn đầu",
        "cover": false
      },
      {
        "id": "photo-12",
        "src": "https://picsum.photos/seed/album-12/800/1000",
        "caption": "Hạnh phúc giản đơn",
        "cover": false
      }
    ]
  },
  "events": {
    "enabled": true,
    "title": "Sự Kiện Cưới",
    "quote": "Sự hiện diện của bạn là món quà quý giá nhất với chúng mình.",
    "showAddToCalendar": true,
    "items": [
      {
        "id": "event-1",
        "name": "Lễ Ăn Hỏi",
        "date": "2027-02-13",
        "time": "08:00",
        "venue": "Nhà trai",
        "address": "Số 123, Đường Hoa Hồng, Quận 1, TP. Hồ Chí Minh",
        "mapsUrl": "https://www.google.com/maps/search/?api=1&query=123+%C4%90%C6%B0%E1%BB%9Dng+Hoa+H%E1%BB%93ng+Qu%E1%BA%ADn+1+TP+H%E1%BB%93+Ch%C3%AD+Minh",
        "image": "https://picsum.photos/seed/event-1/800/600",
        "note": "Dress code: trắng – hồng pastel. Lễ diễn ra tại tư gia nhà trai."
      },
      {
        "id": "event-2",
        "name": "Lễ Cưới & Tiệc Chiêu Đãi",
        "date": "2027-02-14",
        "time": "09:00",
        "venue": "Trung tâm tiệc cưới Hạnh Phúc",
        "address": "Số 456, Đường Tình Yêu, Quận 3, TP. Hồ Chí Minh",
        "mapsUrl": "https://www.google.com/maps/search/?api=1&query=Trung+t%C3%A2m+ti%E1%BB%87c+c%C6%B0%E1%BB%9Bi+H%E1%BA%A1nh+Ph%C3%BAc+Qu%E1%BA%ADn+3+TP+H%E1%BB%93+Ch%C3%AD+Minh",
        "image": "https://picsum.photos/seed/event-2/800/600",
        "note": "Đón khách từ 08:30. Có bãi đỗ xe miễn phí trong khuôn viên trung tâm."
      }
    ]
  },
  "video": {
    "enabled": true,
    "title": "Video Cưới",
    "youtubeUrl": ""
  },
  "music": {
    "enabled": true,
    "url": "assets/beautiful-in-white.mp3",
    "volume": 0.5,
    "showButton": true
  },
  "theme": {
    "preset": "pink",
    "colors": {
      "primary": "#b76e79",
      "secondary": "#8a6d5c",
      "background": "#fdf8f5",
      "text": "#4a3f3a"
    },
    "fonts": {
      "heading": "Noto Serif",
      "accent": "Dancing Script",
      "body": "Be Vietnam Pro"
    },
    "effect": "petals",
    "scrollSpeed": "normal",
    "showLoading": true
  },
  "sections": [
    {
      "id": "hero",
      "label": "Trang chủ",
      "enabled": true
    },
    {
      "id": "couple",
      "label": "Cặp đôi",
      "enabled": true
    },
    {
      "id": "album",
      "label": "Album Hình Cưới",
      "enabled": true
    },
    {
      "id": "events",
      "label": "Sự kiện cưới",
      "enabled": true
    },
    {
      "id": "video",
      "label": "Video Cưới",
      "enabled": true
    },
    {
      "id": "gift",
      "label": "Mừng cưới",
      "enabled": true
    },
    {
      "id": "guestbook",
      "label": "Sổ Lưu Bút",
      "enabled": true
    }
  ],
  "guestbook": {
    "enabled": true,
    "title": "Sổ Lưu Bút",
    "subtitle": "Hãy để lại những lời chúc tốt đẹp nhất cho chúng mình nhé!",
    "moderation": true,
    "thankYou": "Cảm ơn bạn đã gửi lời chúc! Lời chúc của bạn sẽ được hiển thị sau khi được duyệt.",
    "suggestions": [
      "Chúc hai bạn trăm năm hạnh phúc!",
      "Chúc mừng hạnh phúc hai bạn!",
      "Chúc hai bạn sớm có tin vui!",
      "Mãi mãi hạnh phúc nhé hai bạn!"
    ]
  },
  "rsvp": {
    "enabled": true,
    "title": "Xác Nhận Tham Dự",
    "subtitle": "Vui lòng xác nhận trước ngày 01/02/2027 để chúng mình chuẩn bị chu đáo nhất.",
    "deadline": "2027-02-01",
    "fields": {
      "name": true,
      "phone": true,
      "email": false,
      "guests": true,
      "side": true,
      "ceremonies": true,
      "message": true
    },
    "ceremonyOptions": [
      "Lễ Ăn Hỏi",
      "Lễ Cưới",
      "Cả hai lễ"
    ],
    "questions": {
      "guests": "Số người đi cùng bạn (kể cả bạn)",
      "side": "Bạn là khách của bên nào?",
      "ceremonies": "Bạn sẽ tham dự lễ nào?",
      "message": "Lời nhắn gửi đến cô dâu chú rể"
    }
  }
};
