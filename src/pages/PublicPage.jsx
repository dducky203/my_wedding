/**
 * PublicPage.jsx — Trang thiệp cưới công khai (port index.html + site.js gốc).
 *
 * - Config nạp bằng getConfig() qua useConfig (localStorage → config.json → mẫu),
 *   theme áp qua CSS variables, SEO cập nhật động, live preview từ Dashboard.
 * - Navbar: menu dựng từ config.sections (bỏ hero/"Trang chủ"), hamburger mobile,
 *   đổi màu khi cuộn, scrollspy. Hero: slideshow 5s, đếm ngược, ?guest=,
 *   CTA sang rsvp.html, cánh hoa rơi, reveal khi cuộn.
 * - Nhạc nền: nút tròn nổi, tự phát sau tương tác đầu tiên nếu bị chặn autoplay.
 * - Cặp đôi (theo couple.order), album masonry + lightbox, sự kiện + modal
 *   "Thêm vào lịch" (Google Calendar / tải .ics), video YouTube (click mới
 *   tạo iframe), mừng cưới (QR ảnh ưu tiên → SVG sinh tại chỗ → ảnh gốc),
 *   sổ lưu bút (xem Guestbook.jsx), quote + footer (nút Quản trị).
 *
 * LƯU Ý: utils.googleCalendarUrl/downloadIcs trong lib hiện gọi coupleNames()
 * không tham số nên sẽ ném lỗi — file này tự dựng URL Google Calendar và file
 * .ics bằng toCalStamp/icsEscape + coupleNames(cfg) thay vì dùng 2 hàm đó.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fmtDate, parseYoutubeId, toCalStamp, icsEscape, coupleNames,
} from '../lib/utils.js';
import { makeGiftQrSvg, isUsableQrImage } from '../lib/qr.js';
import { Icon } from '../lib/icons.jsx';
import { useConfig, useToast, Toast, handleImgError } from '../components/common.jsx';
import Guestbook from '../components/Guestbook.jsx';

const TILE_PATTERN = ['tall', 'portrait', 'landscape', 'portrait', 'square', 'tall', 'portrait', 'landscape', 'tall', 'portrait', 'square', 'portrait'];
const REDUCE_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- "Thêm vào lịch": dựng URL Google Calendar / file .ics ---------- */
function buildGoogleCalendarUrl(ev, cfg) {
  const [first, second] = coupleNames(cfg);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${ev.name} — Lễ cưới ${first} & ${second}`,
    dates: `${toCalStamp(ev.date, ev.time)}/${toCalStamp(ev.date, ev.time, 2)}`,
    details: ev.note || '',
    location: `${ev.venue}, ${ev.address}`,
    ctz: 'Asia/Ho_Chi_Minh',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadIcsFile(ev, cfg) {
  const [first, second] = coupleNames(cfg);
  const uidStamp = `${Date.now()}@wedding-invitation`;
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wedding Invitation//EN',
    'BEGIN:VEVENT',
    `UID:${uidStamp}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toCalStamp(ev.date, ev.time)}`,
    `DTEND:${toCalStamp(ev.date, ev.time, 2)}`,
    `SUMMARY:${icsEscape(`${ev.name} — Lễ cưới ${first} & ${second}`)}`,
    `DESCRIPTION:${icsEscape(ev.note || '')}`,
    `LOCATION:${icsEscape(`${ev.venue}, ${ev.address}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ev.name.replace(/\s+/g, '-').toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Album: một ô ảnh (bỏ skeleton khi tải xong) ---------- */
function AlbumItem({ photo, index, onOpen }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <figure
      className={`album__item album__item--${TILE_PATTERN[index % TILE_PATTERN.length]}${loaded ? '' : ' album__item--loading'}`}
      data-aos="fade-up" role="button" tabIndex={0}
      aria-label={`Xem ảnh: ${photo.caption || `Ảnh ${index + 1}`}`}
      onClick={() => onOpen(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(index);
        }
      }}
    >
      <img
        src={photo.src} alt={photo.caption || `Ảnh cưới ${index + 1}`} loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={(e) => { setLoaded(true); handleImgError(e, `album-${index + 1}`); }}
      />
      {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
    </figure>
  );
}

/* ---------- Mừng cưới: một thẻ tài khoản + QR ---------- */
function GiftCard({ person, role, aos, showToast }) {
  const g = person || {};
  const qrSvg = useMemo(() => {
    if (isUsableQrImage(g.qrImage)) return null;
    return makeGiftQrSvg({
      bank: g.bank, accountNumber: g.accountNumber, accountName: g.accountName,
    });
  }, [g.bank, g.accountNumber, g.accountName, g.qrImage]);

  const copyAccount = async () => {
    const number = g.accountNumber || '';
    let copied = false;
    try {
      await navigator.clipboard.writeText(number);
      copied = true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = number;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        copied = document.execCommand('copy');
      } catch (err) {
        copied = false;
      }
      ta.remove();
    }
    showToast(copied ? `Đã sao chép số tài khoản ${number}` : `Số tài khoản: ${number}`);
  };

  return (
    <article className="gift-card" data-aos={aos}>
      <p className="gift-card__role">{role}</p>
      <div
        className="gift-card__qr" role="img" aria-label={`Mã QR mừng cưới ${role}`}
      >
        {isUsableQrImage(g.qrImage) ? (
          <img src={g.qrImage} alt={`Mã QR mừng cưới ${role}`} loading="eager" data-fallback-done="1" />
        ) : qrSvg ? (
          <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
        ) : g.qrImage ? (
          <img src={g.qrImage} alt={`Mã QR mừng cưới ${role}`} loading="eager" data-fallback-done="1" />
        ) : null}
      </div>
      <dl className="gift-card__info">
        <div><dt>Ngân hàng</dt><dd>{g.bank || ''}</dd></div>
        <div><dt>Số tài khoản</dt><dd className="gift-card__number">{g.accountNumber || ''}</dd></div>
        <div><dt>Chủ tài khoản</dt><dd>{g.accountName || ''}</dd></div>
      </dl>
      <button type="button" className="btn btn--primary gift-card__copy" onClick={copyAccount}>
        <Icon name="copy" size={18} /> Sao chép số tài khoản
      </button>
    </article>
  );
}

/* ---------- Video cưới: thumbnail, bấm mới nhúng iframe ---------- */
function VideoSection({ cfg }) {
  const [playing, setPlaying] = useState(false);
  const id = parseYoutubeId(cfg.video.youtubeUrl);
  const watchUrl = id ? `https://www.youtube.com/watch?v=${id}` : '';
  return (
    <section id="video" className="section video" aria-labelledby="video-title">
      <div className="container">
        <h2 className="section__title" id="video-title" data-aos="fade-up">{cfg.video.title}</h2>
        <div className="video__wrap" id="video-wrap">
          {!id ? (
            <div className="video__placeholder">
              <Icon name="video" size={42} />
              <p>Video cưới sẽ được cập nhật.</p>
            </div>
          ) : playing ? (
            <>
              <div className="video__frame">
                <iframe
                  src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`}
                  title="Video cưới"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <p className="video__fallback">
                <a href={watchUrl} target="_blank" rel="noopener">
                  Xem trên YouTube <Icon name="external" size={18} />
                </a>
              </p>
            </>
          ) : (
            <>
              <button type="button" className="video__thumb" aria-label="Phát video cưới" onClick={() => setPlaying(true)}>
                <img
                  src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
                  alt="Ảnh bìa video cưới" loading="lazy"
                  onError={(e) => handleImgError(e, 'video-thumb')}
                />
                <span className="video__play">
                  <span className="video__play-btn"><Icon name="play" size={18} /></span>
                </span>
              </button>
              <p className="video__fallback">
                <a href={watchUrl} target="_blank" rel="noopener">
                  Xem trên YouTube <Icon name="external" size={18} />
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ============================ TRANG CHÍNH ============================ */
export default function PublicPage() {
  const cfg = useConfig(false);
  const { toast, showToast } = useToast();
  const rootRef = useRef(null);

  const [navScrolled, setNavScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [heroIndex, setHeroIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [calendarEvent, setCalendarEvent] = useState(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [loadingHide, setLoadingHide] = useState(false);
  const [loadingGone, setLoadingGone] = useState(false);
  const audioRef = useRef(null);
  const musicUserPausedRef = useRef(false);

  const guest = useMemo(() => {
    try {
      const g = new URLSearchParams(window.location.search).get('guest');
      return g && g.trim() ? g.trim() : '';
    } catch (e) {
      return '';
    }
  }, []);

  // Màn hình loading: giữ tối thiểu ~600ms rồi mờ dần, gỡ sau 1300ms
  useEffect(() => {
    if (!cfg) return undefined;
    if (cfg.theme && cfg.theme.showLoading === false) {
      setLoadingGone(true);
      return undefined;
    }
    const t1 = setTimeout(() => setLoadingHide(true), 600);
    const t2 = setTimeout(() => setLoadingGone(true), 1300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [cfg]);

  // Navbar: đổi màu khi cuộn
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scrollspy: đánh dấu mục section đang xem
  useEffect(() => {
    if (!cfg || !('IntersectionObserver' in window)) return undefined;
    const links = () => rootRef.current?.querySelectorAll('.nav__link') || [];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links().forEach((a) => a.classList.toggle('nav__link--active', a.dataset.section === entry.target.id));
        setActiveSection(entry.target.id);
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    rootRef.current?.querySelectorAll('main section[id]').forEach((sec) => io.observe(sec));
    return () => io.disconnect();
  }, [cfg]);

  // Reveal khi cuộn (IntersectionObserver, như initReveal bản gốc)
  useEffect(() => {
    if (!cfg || !rootRef.current) return undefined;
    const targets = rootRef.current.querySelectorAll('[data-aos]');
    if (REDUCE_MOTION || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-inview'));
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('is-inview', entry.isIntersecting);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [cfg]);

  // Slideshow hero: tự đổi mỗi 5 giây
  const heroImages = cfg?.couple?.heroImages || [];
  useEffect(() => {
    if (!cfg || heroImages.length <= 1 || !cfg.couple.heroSlideshow || REDUCE_MOTION) return undefined;
    const t = setInterval(() => setHeroIndex((i) => (i + 1) % heroImages.length), 5000);
    return () => clearInterval(t);
  }, [cfg, heroImages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Đồng hồ đếm ngược: tick mỗi giây
  useEffect(() => {
    if (!cfg) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cfg]);

  // Nhạc nền: thử tự phát, nếu bị chặn thì phát sau tương tác đầu tiên
  useEffect(() => {
    if (!cfg || !cfg.music) return undefined;
    const hasMusic = cfg.music.enabled && !!cfg.music.url;
    if (!hasMusic || cfg.music.showButton === false) return undefined;
    const audio = new Audio(cfg.music.url);
    audio.loop = true;
    audio.volume = typeof cfg.music.volume === 'number' ? cfg.music.volume : 0.5;
    audioRef.current = audio;
    musicUserPausedRef.current = false;
    const tryPlay = () => {
      if (musicUserPausedRef.current || !audioRef.current) return;
      // play() trả về Promise ở trình duyệt thật; phòng khi môi trường
      // không hỗ trợ (trả về undefined) thì không làm sập cả trang.
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          setMusicPlaying(true);
        }).catch(() => { /* Trình duyệt chặn autoplay — chờ lần bấm nút */ });
      }
    };
    const firstInteraction = () => tryPlay();
    window.addEventListener('pointerdown', firstInteraction, { once: true });
    window.addEventListener('keydown', firstInteraction, { once: true });
    tryPlay();
    return () => {
      window.removeEventListener('pointerdown', firstInteraction);
      window.removeEventListener('keydown', firstInteraction);
      audio.pause();
      audioRef.current = null;
      setMusicPlaying(false);
    };
  }, [cfg]);

  // Lightbox: phím tắt Esc / mũi tên; khoá cuộn nền khi mở
  useEffect(() => {
    if (lightboxIndex === null) return undefined;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      const photos = cfg?.album?.photos || [];
      if (!photos.length) return;
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i - 1 + photos.length) % photos.length);
      if (e.key === 'ArrowRight') setLightboxIndex((i) => (i + 1) % photos.length);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [lightboxIndex, cfg]);

  // Modal lịch: Esc đóng, khoá cuộn nền khi mở
  useEffect(() => {
    if (!calendarEvent) return undefined;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setCalendarEvent(null);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [calendarEvent]);

  // Cánh hoa / trái tim rơi (tôn trọng prefers-reduced-motion)
  const fxItems = useMemo(() => {
    if (!cfg || cfg.theme.effect === 'none' || REDUCE_MOTION) return [];
    const count = 16;
    return Array.from({ length: count }, (_, i) => {
      const size = 10 + Math.random() * 14;
      return {
        key: i,
        left: `${Math.random() * 100}vw`,
        duration: `${9 + Math.random() * 9}s`,
        delay: `${-Math.random() * 18}s`,
        width: size,
        height: size * 0.8,
        fontSize: size + 6,
      };
    });
  }, [cfg]);

  const toggleMusic = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (musicPlaying) {
      audio.pause();
      setMusicPlaying(false);
      musicUserPausedRef.current = true;
    } else {
      musicUserPausedRef.current = false;
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => setMusicPlaying(true))
          .catch(() => showToast('Không phát được nhạc. Hãy thử lại.'));
      } else {
        setMusicPlaying(true);
      }
    }
  };

  if (!cfg) {
    return (
      <div id="loading-screen" className="loading" role="status" aria-label="Đang tải thiệp cưới">
        <div className="loading__monogram" id="loading-monogram">T &amp; T</div>
        <div className="loading__spinner" aria-hidden="true" />
        <p className="loading__text">Đang chuẩn bị thiệp cưới…</p>
      </div>
    );
  }

  const sectionVisible = (id) => {
    const entry = cfg.sections.find((s) => s.id === id);
    if (!entry || !entry.enabled) return false;
    if (id === 'gift') return !cfg.gift || cfg.gift.enabled !== false;
    if (id === 'album') return cfg.album.enabled !== false;
    if (id === 'events') return cfg.events.enabled !== false;
    if (id === 'video') return cfg.video.enabled !== false;
    if (id === 'guestbook') return cfg.guestbook.enabled !== false;
    return true;
  };

  const navItems = cfg.sections.filter((s) => s.id !== 'hero' && sectionVisible(s.id));
  const [firstName, secondName] = coupleNames(cfg);
  const names = `${firstName} & ${secondName}`;
  const target = new Date(cfg.couple.weddingDate).getTime();
  const diff = target - now;
  const countdownDone = Number.isNaN(target) || diff <= 0;
  const cdDays = countdownDone ? 0 : Math.floor(diff / 86400000);
  const cdHours = countdownDone ? 0 : Math.floor((diff % 86400000) / 3600000);
  const cdMins = countdownDone ? 0 : Math.floor((diff % 3600000) / 60000);
  const cdSecs = countdownDone ? 0 : Math.floor((diff % 60000) / 1000);
  const photos = cfg.album.photos || [];
  const lightboxPhoto = lightboxIndex !== null ? photos[lightboxIndex] : null;
  const showMusicBtn = cfg.music.enabled && !!cfg.music.url && cfg.music.showButton !== false;

  const coupleCard = (person, role, aos) => (
    <article className="couple__card" data-aos={aos} key={role}>
      <img
        className="couple__photo" src={person.photo}
        alt={`Ảnh ${role} ${person.name}`} loading="lazy"
        onError={(e) => handleImgError(e, `couple-${role}`)}
      />
      <p className="couple__role">{role}</p>
      <h3 className="couple__name">{person.name}</h3>
      {person.showParents !== false && (
        <p className="couple__parents">
          Con ông {person.father}
          <br />
          Con bà {person.mother}
        </p>
      )}
      <p className="couple__bio">{person.bio}</p>
    </article>
  );
  const coupleCards = cfg.couple.order === 'brideFirst'
    ? [coupleCard(cfg.couple.bride, 'Cô Dâu', 'fade-right'), coupleCard(cfg.couple.groom, 'Chú Rể', 'fade-left')]
    : [coupleCard(cfg.couple.groom, 'Chú Rể', 'fade-right'), coupleCard(cfg.couple.bride, 'Cô Dâu', 'fade-left')];
  const giftCards = cfg.couple.order === 'brideFirst'
    ? [
      <GiftCard key="bride" person={cfg.gift.bride} role="Cô Dâu" aos="fade-right" showToast={showToast} />,
      <GiftCard key="groom" person={cfg.gift.groom} role="Chú Rể" aos="fade-left" showToast={showToast} />,
    ]
    : [
      <GiftCard key="groom" person={cfg.gift.groom} role="Chú Rể" aos="fade-right" showToast={showToast} />,
      <GiftCard key="bride" person={cfg.gift.bride} role="Cô Dâu" aos="fade-left" showToast={showToast} />,
    ];

  const sectionsById = {
    hero: sectionVisible('hero') && (
      <section id="hero" className="hero" aria-label="Thiệp cưới" key="hero">
        <div id="hero-slides" className="hero__slides" aria-hidden="true">
          {heroImages.map((src, i) => (
            <div
              key={i}
              className={`hero__slide${i === heroIndex ? ' hero__slide--active' : ''}`}
              style={{ backgroundImage: `url("${src}")` }}
            />
          ))}
        </div>
        <div className="hero__overlay" aria-hidden="true" />
        <div className="hero__content container">
          {guest && (
            <p className="hero__guest" id="guest-line">
              Trân trọng kính mời <strong>{guest}</strong>
            </p>
          )}
          <p className="hero__tagline" id="hero-tagline">{cfg.couple.tagline}</p>
          <h1 className="hero__names" id="hero-names">
            <span className="hero__name">{firstName}</span>{' '}
            <span className="hero__amp">&amp;</span>{' '}
            <span className="hero__name">{secondName}</span>
          </h1>
          <p className="hero__save-date" id="hero-save-date">Save The Date</p>
          <p className="hero__date" id="hero-date">{fmtDate(cfg.couple.weddingDate)}</p>
          <div className="countdown" id="countdown" role="timer" aria-label="Đồng hồ đếm ngược đến ngày cưới" hidden={countdownDone}>
            <div className="countdown__item"><span className="countdown__num" id="cd-days">{cdDays}</span><span className="countdown__label">Ngày</span></div>
            <div className="countdown__item"><span className="countdown__num" id="cd-hours">{String(cdHours).padStart(2, '0')}</span><span className="countdown__label">Giờ</span></div>
            <div className="countdown__item"><span className="countdown__num" id="cd-mins">{String(cdMins).padStart(2, '0')}</span><span className="countdown__label">Phút</span></div>
            <div className="countdown__item"><span className="countdown__num" id="cd-secs">{String(cdSecs).padStart(2, '0')}</span><span className="countdown__label">Giây</span></div>
          </div>
          <p className="countdown__done" id="countdown-done" hidden={!countdownDone}>Hôm nay là ngày cưới! 🎉</p>
          <a href="rsvp.html" className="btn btn--primary hero__cta" id="hero-cta">{cfg.couple.ctaText}</a>
          {heroImages.length > 1 && cfg.couple.heroSlideshow && (
            <div className="hero__dots" id="hero-dots" role="tablist" aria-label="Chuyển ảnh nền">
              {heroImages.map((_, i) => (
                <button
                  key={i} type="button"
                  className={`hero__dot${i === heroIndex ? ' hero__dot--active' : ''}`}
                  role="tab" aria-label={`Ảnh nền ${i + 1}`}
                  onClick={() => setHeroIndex(i)}
                />
              ))}
            </div>
          )}
        </div>
        <a href="#couple" className="hero__scroll" aria-label="Cuộn xuống xem tiếp">
          <Icon name="chevronDown" size={18} />
        </a>
      </section>
    ),
    couple: sectionVisible('couple') && (
      <section id="couple" className="section couple" aria-labelledby="couple-title" key="couple">
        <div className="container">
          <h2 className="section__title" id="couple-title" data-aos="fade-up">Cô Dâu &amp; Chú Rể</h2>
          <div className="couple__grid" id="couple-grid">{coupleCards}</div>
        </div>
      </section>
    ),
    album: sectionVisible('album') && (
      <section id="album" className="section album" aria-labelledby="album-title" key="album">
        <div className="container">
          <h2 className="section__title" id="album-title" data-aos="fade-up">{cfg.album.title}</h2>
          <p className="section__subtitle" id="album-subtitle" data-aos="fade-up">{cfg.album.subtitle}</p>
          <div className={`album__grid album__grid--cols-${cfg.album.columns || 3}`} id="album-grid">
            {photos.map((p, i) => (
              <AlbumItem key={p.id || i} photo={p} index={i} onOpen={setLightboxIndex} />
            ))}
          </div>
          <div className="album__more">
            <button type="button" className="btn btn--outline" id="album-view-all" onClick={() => setLightboxIndex(0)}>
              Tất cả hình ảnh
            </button>
          </div>
        </div>
      </section>
    ),
    events: sectionVisible('events') && (
      <section id="events" className="section events" aria-labelledby="events-title" key="events">
        <div className="container">
          <h2 className="section__title" id="events-title" data-aos="fade-up">{cfg.events.title}</h2>
          <p className="section__quote" id="events-quote" data-aos="fade-up">{cfg.events.quote}</p>
          <div className="events__grid" id="events-grid">
            {(cfg.events.items || []).map((ev, i) => (
              <article className="event-card" data-aos="fade-up" key={ev.id || i}>
                <img
                  className="event-card__img" src={ev.image} alt={ev.name} loading="lazy"
                  onError={(e) => handleImgError(e, `event-${i + 1}`)}
                />
                <div className="event-card__body">
                  <h3 className="event-card__name">{ev.name}</h3>
                  <p className="event-card__meta">
                    <Icon name="calendar" size={18} />{fmtDate(ev.date)} · {ev.time}
                  </p>
                  <p className="event-card__meta"><Icon name="mapPin" size={18} />{ev.venue}</p>
                  <p className="event-card__meta"><Icon name="mapPin" size={18} />{ev.address}</p>
                  {ev.note ? <p className="event-card__note">{ev.note}</p> : null}
                  <div className="event-card__actions">
                    {ev.mapsUrl ? (
                      <a className="btn btn--outline" href={ev.mapsUrl} target="_blank" rel="noopener">
                        <Icon name="mapPin" size={18} /> Xem bản đồ
                      </a>
                    ) : null}
                    {cfg.events.showAddToCalendar ? (
                      <button type="button" className="btn btn--primary event-card__calendar" onClick={() => setCalendarEvent(ev)}>
                        <Icon name="calendarPlus" size={18} /> Thêm vào lịch
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    ),
    video: sectionVisible('video') && <VideoSection cfg={cfg} key="video" />,
    gift: sectionVisible('gift') && (
      <section id="gift" className="section gift" aria-labelledby="gift-title" key="gift">
        <div className="container">
          <h2 className="section__title" id="gift-title" data-aos="fade-up">{cfg.gift.title || 'Mừng Cưới'}</h2>
          <p className="section__subtitle" id="gift-subtitle" data-aos="fade-up">{cfg.gift.subtitle || ''}</p>
          <div className="gift__grid" id="gift-grid">{giftCards}</div>
        </div>
      </section>
    ),
    guestbook: sectionVisible('guestbook') && (
      <section id="guestbook" className="section guestbook" aria-labelledby="guestbook-title" key="guestbook">
        <div className="container">
          <h2 className="section__title" id="guestbook-title" data-aos="fade-up">{cfg.guestbook.title}</h2>
          <p className="section__subtitle" id="guestbook-subtitle" data-aos="fade-up">{cfg.guestbook.subtitle}</p>
          <Guestbook cfg={cfg} showToast={showToast} />
        </div>
      </section>
    ),
  };

  // Thứ tự section theo config.sections (như renderIndex bản gốc)
  const orderedSections = cfg.sections
    .map((s) => sectionsById[s.id])
    .filter(Boolean);

  return (
    <div ref={rootRef}>
      {!loadingGone && (
        <div id="loading-screen" className={`loading${loadingHide ? ' loading--hide' : ''}`} role="status" aria-label="Đang tải thiệp cưới">
          <div className="loading__monogram" id="loading-monogram">{cfg.couple.monogram}</div>
          <div className="loading__spinner" aria-hidden="true" />
          <p className="loading__text">Đang chuẩn bị thiệp cưới…</p>
        </div>
      )}

      <div id="fx-layer" className="fx-layer" aria-hidden="true">
        {fxItems.map((item) => (
          <span
            key={item.key}
            className={`fx-layer__item fx-layer__item--${cfg.theme.effect === 'hearts' ? 'heart' : 'petal'}`}
            style={{
              left: item.left,
              animationDuration: item.duration,
              animationDelay: item.delay,
              width: cfg.theme.effect === 'hearts' ? undefined : item.width,
              height: cfg.theme.effect === 'hearts' ? undefined : item.height,
              fontSize: cfg.theme.effect === 'hearts' ? item.fontSize : undefined,
            }}
          >
            {cfg.theme.effect === 'hearts' ? '♥' : null}
          </span>
        ))}
      </div>

      <header id="site-nav" className={`nav${navScrolled ? ' nav--scrolled' : ''}`}>
        <div className="nav__inner container">
          <a href="#hero" className="nav__logo" id="nav-monogram" aria-label="Về đầu trang">{cfg.couple.monogram}</a>
          <nav className="nav__menu-wrap" aria-label="Menu chính">
            <ul id="nav-menu" className={`nav__menu${menuOpen ? ' nav__menu--open' : ''}`}>
              {navItems.map((s) => (
                <li key={s.id}>
                  <a
                    className={`nav__link${activeSection === s.id ? ' nav__link--active' : ''}`}
                    href={`#${s.id}`} data-section={s.id}
                    onClick={() => setMenuOpen(false)}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="nav__actions">
            <button
              id="nav-toggle" className="nav__toggle" type="button"
              aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={String(menuOpen)} aria-controls="nav-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <Icon name={menuOpen ? 'x' : 'menu'} size={18} />
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        {orderedSections}
        <section className="section quote" aria-label="Lời trích dẫn">
          <div className="container">
            <blockquote className="quote__text" id="quote-text" data-aos="fade-up">“{cfg.couple.slogan}”</blockquote>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer__inner">
          <p className="footer__names" id="footer-names">
            <span className="footer__name">{firstName}</span>{' '}
            <span className="footer__amp">&amp;</span>{' '}
            <span className="footer__name">{secondName}</span>
          </p>
          <p className="footer__date" id="footer-date">{fmtDate(cfg.couple.weddingDate)}</p>
          <p className="footer__slogan" id="footer-slogan">{cfg.couple.slogan}</p>
          <div className="footer__actions">
            <a href="admin/login.html" className="btn btn--primary footer__admin">
              <Icon name="grid" size={18} /> Quản trị
            </a>
          </div>
        </div>
      </footer>

      {showMusicBtn && (
        <button
          type="button" id="music-toggle"
          className={`music-btn${musicPlaying ? ' music-btn--playing' : ''}`}
          aria-label={musicPlaying ? 'Tắt nhạc nền' : 'Bật nhạc nền'}
          title={musicPlaying ? 'Tắt nhạc nền' : 'Bật nhạc nền'}
          aria-pressed={String(musicPlaying)}
          onClick={toggleMusic}
        >
          <span className="music-btn__icon">
            <Icon name={musicPlaying ? 'volume' : 'volumeX'} size={20} />
          </span>
        </button>
      )}

      {lightboxIndex !== null && lightboxPhoto && (
        <div
          id="lightbox" className="lightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh cưới"
          onClick={(e) => { if (e.target === e.currentTarget) setLightboxIndex(null); }}
        >
          <button type="button" className="lightbox__close" id="lightbox-close" aria-label="Đóng" onClick={() => setLightboxIndex(null)}>
            <Icon name="x" size={18} />
          </button>
          <button
            type="button" className="lightbox__nav lightbox__nav--prev" id="lightbox-prev" aria-label="Ảnh trước"
            onClick={() => setLightboxIndex((i) => (i - 1 + photos.length) % photos.length)}
          >
            <Icon name="chevronLeft" size={18} />
          </button>
          <figure className="lightbox__figure">
            <img
              className="lightbox__img" id="lightbox-img"
              src={lightboxPhoto.src} alt={lightboxPhoto.caption || `Ảnh cưới ${lightboxIndex + 1}`}
              onError={(e) => handleImgError(e, `album-${lightboxIndex + 1}`)}
            />
            <figcaption className="lightbox__caption">
              <span id="lightbox-caption">{lightboxPhoto.caption || ''}</span>
              <span className="lightbox__counter" id="lightbox-counter">{lightboxIndex + 1} / {photos.length}</span>
            </figcaption>
          </figure>
          <button
            type="button" className="lightbox__nav lightbox__nav--next" id="lightbox-next" aria-label="Ảnh sau"
            onClick={() => setLightboxIndex((i) => (i + 1) % photos.length)}
          >
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      )}

      {calendarEvent && (
        <div
          id="calendar-modal" className="modal" role="dialog" aria-modal="true" aria-labelledby="calendar-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setCalendarEvent(null); }}
        >
          <div className="modal__box">
            <button type="button" className="modal__close" id="calendar-modal-close" aria-label="Đóng" onClick={() => setCalendarEvent(null)}>
              <Icon name="x" size={20} />
            </button>
            <h3 className="modal__title" id="calendar-modal-title">Thêm vào lịch</h3>
            <p className="modal__event" id="calendar-modal-event">
              {calendarEvent.name} — {fmtDate(calendarEvent.date)} · {calendarEvent.time}
            </p>
            <div className="modal__actions">
              <a
                className="btn btn--primary modal__btn" id="cal-google"
                href={buildGoogleCalendarUrl(calendarEvent, cfg)} target="_blank" rel="noopener"
              >
                Google Calendar
              </a>
              {['cal-apple|Apple Calendar', 'cal-ical|iCal', 'cal-outlook|Outlook', 'cal-yahoo|Yahoo'].map((entry) => {
                const [id, label] = entry.split('|');
                return (
                  <button
                    key={id} type="button" className="btn btn--outline modal__btn" id={id}
                    onClick={() => {
                      downloadIcsFile(calendarEvent, cfg);
                      showToast('Đã tải file lịch (.ics). Mở file để thêm vào lịch của bạn.');
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
      <noscript><p style={{ textAlign: 'center', padding: '2rem' }}>Thiệp cưới cần bật JavaScript để hiển thị đầy đủ nội dung.</p></noscript>
    </div>
  );
}
