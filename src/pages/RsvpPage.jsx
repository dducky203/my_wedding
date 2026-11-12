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
  const names = `${firstName} & ${secondName}`;

  return (
    <>
      <header className="nav nav--simple">
        <div className="nav__inner container">
          <a href="index.html" className="nav__logo" id="nav-monogram" aria-label="Về thiệp cưới">
            {cfg.couple.monogram}
          </a>
        </div>
      </header>

      <main id="main" className="rsvp">
        <div className="container container--narrow">
          <p className="rsvp__names" id="rsvp-names">{names}</p>
          <h1 className="section__title" id="rsvp-title">{cfg.rsvp.title}</h1>
          <p className="section__subtitle" id="rsvp-subtitle">{cfg.rsvp.subtitle}</p>

          <RsvpForm cfg={cfg} showToast={showToast} />

          <div className="rsvp__footer-nav">
            <a href="index.html" className="nav__back">
              <Icon name="arrowLeft" size={17} /> Về thiệp cưới
            </a>
          </div>
        </div>
      </main>

      <footer className="footer footer--simple">
        <div className="container footer__inner">
          <p className="footer__names" id="footer-names">{names}</p>
          <p className="footer__date" id="footer-date">{fmtDate(cfg.couple.weddingDate)}</p>
          <p className="footer__slogan" id="footer-slogan">{cfg.couple.slogan}</p>
          <div className="footer__actions">
            <a href="admin/login.html" className="btn btn--primary footer__admin">
              <Icon name="grid" size={18} /> Quản trị
            </a>
          </div>
        </div>
      </footer>

      <Toast message={toast} />
      <noscript><p style={{ textAlign: 'center', padding: '2rem' }}>Trang xác nhận cần bật JavaScript để gửi được thông tin.</p></noscript>
    </>
  );
}
