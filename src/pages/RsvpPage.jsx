import { Link } from 'react-router-dom';
/**
 * RsvpPage.jsx — Trang xác nhận tham dự riêng (port rsvp.html + site.js gốc).
 *
 * - Header tối giản: CHỈ còn logo monogram căn giữa (không có nút Quản trị).
 * - Form RSVP render động từ config (xem RsvpForm.jsx): tên, SĐT, trạng thái
 *   tham dự, số người, bên nào, lễ nào, lời nhắn; validate + chặn trùng SĐT;
 *   gửi xong hiện màn hình cảm ơn.
 * - Link "← Về thiệp cưới" đặt ở CUỐI trang, bên dưới form.
 * - Footer tối giản: tên cặp đôi, ngày cưới, slogan + nút Quản trị (như bản gốc).
 * - Config nạp bằng getConfig() qua useConfig (localStorage → config.json → mẫu).
 */
import { useEffect } from 'react';
import { fmtDate, coupleNames } from '../lib/utils.js';
import { Icon } from '../lib/icons.jsx';
import { useConfig, useToast, Toast } from '../components/common.jsx';
import RsvpForm from '../components/RsvpForm.jsx';

export default function RsvpPage() {
  const cfg = useConfig(true);
  const { toast, showToast } = useToast();

  // class body riêng của trang RSVP (như <body class="rsvp-page"> bản gốc)
  useEffect(() => {
    document.body.classList.add('rsvp-page');
    return () => document.body.classList.remove('rsvp-page');
  }, []);

  if (!cfg) {
    return (
      <div className="rsvp">
        <div className="container container--narrow">
          <p style={{ textAlign: 'center', padding: '2rem' }}>Đang tải…</p>
        </div>
      </div>
    );
  }

  const [firstName, secondName] = coupleNames(cfg);

  return (
    <>
      <header className="nav nav--simple">
        <div className="nav__inner container">
          <Link to="/" className="nav__logo" id="nav-monogram" aria-label="Về thiệp cưới">
            <img className="nav__logo-image" src="/assets/logo.webp" alt="Logo thiệp cưới" />
          </Link>
        </div>
      </header>

      <main id="main" className="rsvp">
        <div className="container container--narrow">
          <p className="rsvp__names" id="rsvp-names">
            <span className="rsvp__name">{firstName}</span>{' '}
            <span className="rsvp__amp">&</span>{' '}
            <span className="rsvp__name">{secondName}</span>
          </p>
          <h1 className="section__title" id="rsvp-title">{cfg.rsvp.title}</h1>
          <p className="section__subtitle" id="rsvp-subtitle">{cfg.rsvp.subtitle}</p>

          <RsvpForm cfg={cfg} showToast={showToast} />

          <div className="rsvp__footer-nav">
            <Link to="/" className="nav__back">
              <Icon name="arrowLeft" size={17} /> Về thiệp cưới
            </Link>
          </div>
        </div>
      </main>

      <footer className="footer footer--simple">
        <div className="container footer__inner">
          <p className="footer__names" id="footer-names">
            <span className="footer__name">{firstName}</span>{' '}
            <span className="footer__amp">&</span>{' '}
            <span className="footer__name">{secondName}</span>
          </p>
          <p className="footer__date" id="footer-date">{fmtDate(cfg.couple.weddingDate)}</p>
          <p className="footer__slogan" id="footer-slogan">{cfg.couple.slogan}</p>
        </div>
      </footer>

      <Toast message={toast} />
      <noscript><p style={{ textAlign: 'center', padding: '2rem' }}>Trang xác nhận cần bật JavaScript để gửi được thông tin.</p></noscript>
    </>
  );
}
