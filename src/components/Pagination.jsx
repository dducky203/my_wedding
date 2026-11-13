function Arrow({ direction = 'left', edge = false }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={direction === 'right' ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="m14 7-5 5 5 5" />{edge && <path d="M5 6v12" />}
  </svg>;
}

export default function Pagination({ page, pageSize, total, onPageChange, label = 'dòng' }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.max(1, Math.min(page, pages));
  const start = total ? (current - 1) * pageSize + 1 : 0;
  const end = Math.min(current * pageSize, total);
  const candidates = pages <= 7
    ? Array.from({ length: pages }, (_, index) => index + 1)
    : [...new Set([1, ...Array.from({ length: 5 }, (_, index) => Math.max(2, Math.min(current - 2, pages - 5)) + index), pages])];
  const numbers = [];
  candidates.forEach((number, index) => {
    if (index && number - candidates[index - 1] > 1) numbers.push(`gap-${number}`);
    numbers.push(number);
  });
  return <div className="pagination">
    <p className="pagination__summary" aria-live="polite">Hiển thị {start} đến {end} trong tổng số {total} {label}</p>
    <nav className="pagination__controls" aria-label={`Phân trang ${label}`}>
      <button type="button" className="pagination__button" aria-label="Trang đầu" disabled={current === 1} onClick={() => onPageChange(1)}><Arrow edge /></button>
      <button type="button" className="pagination__button" aria-label="Trang trước" disabled={current === 1} onClick={() => onPageChange(current - 1)}><Arrow /></button>
      {numbers.map((number) => typeof number === 'string'
        ? <span className="pagination__ellipsis" key={number}>…</span>
        : <button type="button" key={number} className={`pagination__button${number === current ? ' is-active' : ''}`} aria-label={`Trang ${number}`} aria-current={number === current ? 'page' : undefined} onClick={() => onPageChange(number)}>{number}</button>)}
      <button type="button" className="pagination__button" aria-label="Trang sau" disabled={current === pages} onClick={() => onPageChange(current + 1)}><Arrow direction="right" /></button>
      <button type="button" className="pagination__button" aria-label="Trang cuối" disabled={current === pages} onClick={() => onPageChange(pages)}><Arrow direction="right" edge /></button>
    </nav>
  </div>;
}
