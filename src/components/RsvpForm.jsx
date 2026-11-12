/**
 * RsvpForm.jsx — Form xác nhận tham dự, render động từ config.rsvp
 * (port renderRsvpPage + bindRsvpForm trong site.js gốc).
 *
 * - Các trường theo config.rsvp.fields: name, phone, email, guests, side,
 *   ceremonies, message. Trạng thái tham dự (yes/no/maybe) luôn hiện.
 * - Validate: bắt buộc tên + SĐT (10 số, bắt đầu bằng 0), email đúng dạng,
 *   số người 1–20, chặn gửi trùng SĐT.
 * - Quá hạn chót (config.rsvp.deadline) thì hiện ghi chú và disable nút gửi.
 * - Gửi xong: ẩn form, hiện màn hình cảm ơn (tên + trạng thái + số người).
 */
import { useEffect, useRef, useState } from 'react';
import { getRsvps, addRsvp } from '../lib/store.js';
import { fmtDateShort } from '../lib/utils.js';
import { Icon } from '../lib/icons.jsx';

const STATUS_LABELS = {
  yes: 'sẽ đến tham dự',
  no: 'không đến được',
  maybe: 'chưa chắc chắn',
};

export default function RsvpForm({ cfg, showToast }) {
  const fields = (cfg.rsvp && cfg.rsvp.fields) || {};
  const q = (cfg.rsvp && cfg.rsvp.questions) || {};
  const ceremonyOptions = (cfg.rsvp && cfg.rsvp.ceremonyOptions) || [];

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('yes');
  const [guests, setGuests] = useState(1);
  const [side, setSide] = useState('');
  const [ceremonies, setCeremonies] = useState(
    ceremonyOptions.length ? [ceremonyOptions[0]] : [],
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null); // { name, status, guests }
  const timerRef = useRef(null);

  const today = new Date().toISOString().slice(0, 10);
  const pastDeadline = Boolean(cfg.rsvp && cfg.rsvp.deadline && today > cfg.rsvp.deadline);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const toggleCeremony = (opt) => {
    setCeremonies((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const cleanName = name.trim();
    const cleanPhone = phone.trim().replace(/[\s.]/g, '');
    const cleanEmail = email.trim();
    const cleanMessage = message.trim();
    const guestCount = Number(guests) || 1;

    if (fields.name !== false && !cleanName) {
      setError('Vui lòng nhập họ tên của bạn.');
      return;
    }
    if (fields.phone !== false) {
      if (!cleanPhone) {
        setError('Vui lòng nhập số điện thoại.');
        return;
      }
      if (!/^0\d{9}$/.test(cleanPhone)) {
        setError('Số điện thoại chưa đúng định dạng (10 số, bắt đầu bằng 0). Ví dụ: 0901234567.');
        return;
      }
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Email chưa đúng định dạng.');
      return;
    }
    if (guestCount < 1 || guestCount > 20) {
      setError('Số người tham dự phải từ 1 đến 20.');
      return;
    }
    // Chặn gửi trùng bằng SĐT
    if (cleanPhone && getRsvps().find((r) => r.phone === cleanPhone)) {
      setError('SĐT này đã xác nhận rồi. Nếu cần thay đổi, vui lòng liên hệ trực tiếp cô dâu chú rể.');
      return;
    }

    setSubmitting(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const result = addRsvp({
        name: cleanName,
        phone: cleanPhone,
        email: cleanEmail,
        guests: guestCount,
        side,
        ceremonies: ceremonies.join(', '),
        message: cleanMessage,
        status,
      });
      setSubmitting(false);
      if (!result.ok) {
        setError(result.error || 'Không gửi được xác nhận. Hãy thử lại.');
        return;
      }
      setDone({ name: cleanName, status, guests: guestCount });
      if (showToast) showToast('Đã gửi xác nhận tham dự. Cảm ơn bạn!');
    }, 400);
  };

  if (done) {
    return (
      <div id="rsvp-thankyou" className="rsvp-thankyou">
        <div className="rsvp-thankyou__icon" aria-hidden="true">
          <Icon name="heart" size={38} />
        </div>
        <h2 className="rsvp-thankyou__title">Cảm ơn bạn!</h2>
        <p className="rsvp-thankyou__text" id="rsvp-thankyou-text">
          Cảm ơn <strong>{done.name}</strong>! Bạn đã xác nhận{' '}
          <strong>{STATUS_LABELS[done.status] || STATUS_LABELS.yes}</strong>
          {done.status === 'yes' ? (
            <>
              {' '}với <strong>{done.guests}</strong> người tham dự
            </>
          ) : null}
          . Chúng mình rất mong được gặp bạn trong ngày vui!
        </p>
        <a href="index.html" className="btn btn--primary">Quay lại thiệp</a>
      </div>
    );
  }

  return (
    <form id="rsvp-form" className="rsvp-form" onSubmit={handleSubmit} noValidate>
      <div id="rsvp-fields">
        {fields.name !== false && (
          <div className="form__field">
            <label className="form__label" htmlFor="rsvp-name">
              Họ tên <span className="form__required" aria-hidden="true">*</span>
            </label>
            <input
              className="form__input" type="text" id="rsvp-name" name="name" required
              maxLength={100} placeholder="Tên của bạn" autoComplete="name"
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        {fields.phone !== false && (
          <div className="form__field">
            <label className="form__label" htmlFor="rsvp-phone">
              Số điện thoại <span className="form__required" aria-hidden="true">*</span>
            </label>
            <input
              className="form__input" type="tel" id="rsvp-phone" name="phone" required
              inputMode="numeric" maxLength={11} placeholder="Ví dụ: 0901234567"
              autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        )}
        {fields.email && (
          <div className="form__field">
            <label className="form__label" htmlFor="rsvp-email">Email</label>
            <input
              className="form__input" type="email" id="rsvp-email" name="email"
              maxLength={120} placeholder="email@vidu.com" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}

        <fieldset className="form__field" style={{ border: 'none', padding: 0, marginBottom: 16 }}>
          <legend className="form__label">
            Bạn có tham dự được không? <span className="form__required" aria-hidden="true">*</span>
          </legend>
          <div className="rsvp-form__status">
            <label className="status-option">
              <input type="radio" name="status" value="yes" checked={status === 'yes'} onChange={() => setStatus('yes')} />
              <Icon name="checkCircle" size={26} />Có, mình sẽ đến
            </label>
            <label className="status-option">
              <input type="radio" name="status" value="no" checked={status === 'no'} onChange={() => setStatus('no')} />
              <Icon name="xCircle" size={26} />Tiếc là không đến được
            </label>
            <label className="status-option">
              <input type="radio" name="status" value="maybe" checked={status === 'maybe'} onChange={() => setStatus('maybe')} />
              <Icon name="helpCircle" size={26} />Chưa chắc
            </label>
          </div>
        </fieldset>

        {fields.guests && (
          <div className="form__field">
            <label className="form__label" htmlFor="rsvp-guests">
              {q.guests || 'Số người đi cùng bạn (kể cả bạn)'}
            </label>
            <input
              className="form__input" type="number" id="rsvp-guests" name="guests"
              min={1} max={20} value={guests}
              onChange={(e) => setGuests(e.target.value)}
            />
          </div>
        )}
        {fields.side && (
          <div className="form__field">
            <label className="form__label" htmlFor="rsvp-side">
              {q.side || 'Bạn là khách của bên nào?'}
            </label>
            <select
              className="form__input" id="rsvp-side" name="side"
              value={side} onChange={(e) => setSide(e.target.value)}
            >
              <option value="">— Chọn —</option>
              <option value="Nhà trai">Nhà trai</option>
              <option value="Nhà gái">Nhà gái</option>
              <option value="Bạn chung">Bạn chung</option>
            </select>
          </div>
        )}
        {fields.ceremonies && ceremonyOptions.length > 0 && (
          <fieldset className="form__field" style={{ border: 'none', padding: 0, marginBottom: 16 }}>
            <legend className="form__label">{q.ceremonies || 'Bạn sẽ tham dự lễ nào?'}</legend>
            <div className="rsvp-form__status">
              {ceremonyOptions.map((opt) => (
                <label className="status-option" key={opt}>
                  <input
                    type="checkbox" name="ceremonies" value={opt}
                    checked={ceremonies.includes(opt)}
                    onChange={() => toggleCeremony(opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {fields.message && (
          <div className="form__field">
            <label className="form__label" htmlFor="rsvp-message">
              {q.message || 'Lời nhắn gửi đến cô dâu chú rể'}
            </label>
            <textarea
              className="form__input form__textarea" id="rsvp-message" name="message"
              rows={3} maxLength={500} placeholder="Viết lời nhắn của bạn…"
              value={message} onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        )}
      </div>

      <p className="form__error" id="rsvp-error" role="alert" hidden={!error}>{error}</p>
      {pastDeadline && (
        <p className="rsvp__deadline" id="rsvp-deadline-note" role="status">
          Đã hết hạn nhận xác nhận (hạn chót {fmtDateShort(cfg.rsvp.deadline)}). Cảm ơn bạn đã quan tâm!
        </p>
      )}
      <button type="submit" className="btn btn--primary rsvp-form__submit" id="rsvp-submit" disabled={submitting || pastDeadline}>
        <span className="btn__text">{submitting ? 'Đang gửi…' : 'Gửi xác nhận'}</span>
        <span className="btn__spinner" aria-hidden="true" hidden={!submitting} />
      </button>
    </form>
  );
}
