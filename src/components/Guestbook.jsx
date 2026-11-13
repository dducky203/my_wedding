/**
 * Guestbook.jsx — Sổ lưu bút (port renderGuestbook + renderWishes +
 * bindWishForm trong site.js gốc).
 *
 * - CHỈ hiện lời chúc đã duyệt (approved === true), mới nhất lên đầu.
 * - Dạng SLIDE trượt ngang: desktop 2 thẻ/trang, mobile 1 thẻ/trang,
 *   chỉ lướt bằng vuốt tay / kéo chuột, tự chạy 5 giây/trang
 *   (di chuột vào / đang kéo thì tạm dừng). Không avatar, không ngày tháng.
 * - Lời chúc dài > 200 ký tự: cắt ngắn + nút "Xem thêm / Thu gọn".
 * - Form: tên + email (tuỳ chọn) + lời chúc, gợi ý mẫu bấm là điền.
 *   moderation=true → lời chúc mới approved=false (chờ duyệt), gửi xong
 *   hiện toast cảm ơn theo config.guestbook.thankYou.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getWishes, addWish } from '../lib/store.js';
import { validateWish } from '../lib/wishValidation.js';

function perViewForWidth() {
  return typeof window !== 'undefined' && window.innerWidth >= 768 ? 2 : 1;
}

export default function Guestbook({ cfg, showToast }) {
  const gb = cfg.guestbook || {};
  const [wishes, setWishes] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitTimerRef = useRef(null);

  useEffect(() => {
    reloadWishes();
  }, []);

  // ---- Slider state ----
  const [page, setPage] = useState(0);
  const [perView, setPerView] = useState(perViewForWidth);
  const [vpWidth, setVpWidth] = useState(0);
  const [dragDx, setDragDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState({});
  const viewportRef = useRef(null);
  const dragRef = useRef({ startX: null, dx: 0, dragged: false });

  const pages = Math.max(1, Math.ceil(wishes.length / perView));

  // Đo lại viewport + số thẻ/trang khi đổi cỡ màn hình
  useEffect(() => {
    const measure = () => {
      setPerView(perViewForWidth());
      if (viewportRef.current) setVpWidth(viewportRef.current.clientWidth);
    };
    measure();
    let t = null;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(measure, 120);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, [wishes.length]);

  // Kẹp trang hiện tại khi số trang đổi (vd: sau khi gửi lời chúc mới)
  useEffect(() => {
    setPage((p) => Math.min(p, pages - 1));
  }, [pages]);

  const goTo = useCallback(
    (p) => setPage(((p % pages) + pages) % pages),
    [pages],
  );

  // Tự chạy 5 giây/trang, tạm dừng khi di chuột vào / đang kéo
  useEffect(() => {
    if (pages <= 1 || paused || dragging) return undefined;
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), 5000);
    return () => clearInterval(t);
  }, [pages, paused, dragging]);

  // ---- Vuốt / kéo ----
  const onPointerDown = (e) => {
    if (pages <= 1) return;
    dragRef.current = { startX: e.clientX, dx: 0, dragged: false };
    setDragging(true);
    try {
      viewportRef.current.setPointerCapture(e.pointerId);
    } catch (err) { /* bỏ qua nếu không hỗ trợ */ }
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (d.startX === null) return;
    d.dx = e.clientX - d.startX;
    if (Math.abs(d.dx) > 6) d.dragged = true;
    setDragDx(d.dx);
  };
  const endDrag = () => {
    const d = dragRef.current;
    if (d.startX === null) return;
    dragRef.current = { startX: null, dx: 0, dragged: d.dragged };
    setDragging(false);
    if (d.dx <= -50) goTo(page + 1);
    else if (d.dx >= 50) goTo(page - 1);
    setDragDx(0);
    // Vừa kéo xong thì không kích hoạt nút "Xem thêm" trong thẻ
    setTimeout(() => {
      dragRef.current.dragged = false;
    }, 50);
  };

  const reloadWishes = async () => {
    try {
      setWishes(await getWishes(true));
      setLoadError('');
      setPage(0);
    } catch (err) {
      console.error('[guestbook] Không tải được lời chúc:', err);
      setLoadError('Không tải được lời chúc. Vui lòng thử tải lại trang.');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanMessage = message.trim();
    const validationError = validateWish({ name: cleanName, email: cleanEmail, message: cleanMessage });
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    submitTimerRef.current = setTimeout(async () => {
      const result = await addWish({
        name: cleanName,
        email: cleanEmail,
        message: cleanMessage,
        approved: true,
      });
      setSubmitting(false);
      if (!result.ok) {
        setError(result.error || 'Không gửi được lời chúc. Hãy thử lại.');
        return;
      }
      setName('');
      setEmail('');
      setMessage('');
      await reloadWishes();
      if (showToast) showToast(gb.thankYou || 'Cảm ơn bạn đã gửi lời chúc!');
    }, 400);
  };

  useEffect(() => () => {
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
  }, []);

  const toggleExpand = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
      <form id="wish-form" className="wish-form" onSubmit={handleSubmit} noValidate>
        <div className="form__row">
          <div className="form__field">
            <label className="form__label" htmlFor="wish-name">
              Họ tên <span className="form__required" aria-hidden="true">*</span>
            </label>
            <input
              className="form__input" type="text" id="wish-name" name="name" required
              maxLength={100} placeholder="Tên của bạn" autoComplete="name"
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form__field">
            <label className="form__label" htmlFor="wish-email">Email (tuỳ chọn)</label>
            <input
              className="form__input" type="email" id="wish-email" name="email"
              maxLength={120} placeholder="email@vidu.com" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <div className="form__field">
          <label className="form__label" htmlFor="wish-message">
            Lời chúc <span className="form__required" aria-hidden="true">*</span>
          </label>
          <textarea
            className="form__input form__textarea" id="wish-message" name="message" required
            rows={4} maxLength={1000} placeholder="Viết lời chúc của bạn…"
            value={message} onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <div className="wish-form__suggestions" id="wish-suggestions" aria-label="Lời chúc gợi ý">
          {(gb.suggestions || []).map((s) => (
            <button
              type="button" className="suggestion" key={s}
              onClick={() => {
                setMessage(s);
                document.getElementById('wish-message')?.focus();
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="form__error" id="wish-error" role="alert" hidden={!error}>{error}</p>
        <button type="submit" className="btn btn--primary" id="wish-submit" disabled={submitting}>
          <span className="btn__text">{submitting ? 'Đang gửi…' : 'Gửi lời chúc'}</span>
          <span className="btn__spinner" aria-hidden="true" hidden={!submitting} />
        </button>
      </form>

      <div
        className={wishes.length ? 'wishes wishes--slider' : 'wishes'}
        id="wishes-list" aria-live="polite"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onClickCapture={(e) => {
          if (dragRef.current.dragged) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {loadError ? (
          <p className="wishes__empty" role="alert">{loadError}</p>
        ) : wishes.length === 0 ? (
          <p className="wishes__empty">Chưa có lời chúc nào. Hãy là người đầu tiên gửi lời chúc nhé!</p>
        ) : (
          <>
            <div
              className="wishes__viewport" ref={viewportRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div
                className="wishes__track"
                style={{
                  transform: `translateX(${-page * vpWidth + dragDx}px)`,
                  transition: dragging ? 'none' : undefined,
                }}
              >
                {wishes.map((w) => {
                  const long = w.message.length > 200;
                  const isOpen = !!expanded[w.id];
                  const text = long && !isOpen ? `${w.message.slice(0, 200)}…` : w.message;
                  return (
                    <div className="wish-slide" key={w.id}>
                      <article className="wish-card">
                        <p className="wish-card__name">{w.name}</p>
                        <p className="wish-card__text">{text}</p>
                        {long && (
                          <button
                            type="button" className="wish-card__toggle"
                            onClick={() => toggleExpand(w.id)}
                          >
                            {isOpen ? 'Thu gọn' : 'Xem thêm'}
                          </button>
                        )}
                      </article>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
