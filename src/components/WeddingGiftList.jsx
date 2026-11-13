import { useEffect, useMemo, useRef, useState } from 'react';
import { getWeddingGiftList, saveWeddingGiftList } from '../lib/store.js';
import { GIFT_PAGE_SIZE, summarizeGiftTable } from '../lib/weddingGiftSummary.js';
import Pagination from './Pagination.jsx';

const money = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);

export default function WeddingGiftList() {
  const [data, setData] = useState(null);
  const [book, setBook] = useState(null);
  const [matrix, setMatrix] = useState([]);
  const [sheetName, setSheetName] = useState('');
  const [headerRow, setHeaderRow] = useState(1);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [table, setTable] = useState(null);
  const parser = useRef(null);
  const dirty = !!book;

  async function load() {
    setBusy('loading'); setError('');
    try { setData(await getWeddingGiftList()); }
    catch (err) { setError(`Không tải được danh sách: ${err.message}. Hãy kiểm tra Rules mới nhất.`); }
    finally { setBusy(''); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { setPage(1); }, [search, table, data]);

  function chooseSheet(workbook, name) {
    const rows = parser.current.readGiftSheet(workbook, name);
    if (!rows.length) throw new Error('Sheet này không có dữ liệu.');
    const first = rows.findIndex((row) => row.some((cell) => String(cell).trim()));
    if (first < 0) throw new Error('Sheet này không có dữ liệu.');
    setMatrix(rows); setSheetName(name); setHeaderRow(first + 1);
    setTable(parser.current.buildGiftTable(rows, first + 1));
  }

  async function importFile(file) {
    if (!file) return;
    setError(''); setNotice(''); setBusy('reading');
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Vui lòng chọn file .xlsx, .xls hoặc .csv.');
      if (file.size > 10 * 1024 * 1024) throw new Error('File vượt quá 10 MB.');
      const [XLSX, helpers] = await Promise.all([import('xlsx'), import('../lib/weddingGiftImport.js')]);
      parser.current = helpers;
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellText: true });
      if (!workbook.SheetNames.length) throw new Error('File không có sheet.');
      const name = workbook.SheetNames.find((name) => workbook.Sheets[name]['!ref']);
      if (!name) throw new Error('File không có dữ liệu.');
      chooseSheet(workbook, name);
      setBook(workbook); setFileName(file.name); setSearch('');
    } catch (err) { setError(err.message || 'Không đọc được file Excel.'); }
    finally { setBusy(''); }
  }

  async function save() {
    setBusy('saving'); setError(''); setNotice('');
    try {
      if (!table?.rows.length) throw new Error('Không có dòng dữ liệu để lưu. Kiểm tra lại dòng tiêu đề.');
      const check = summarizeGiftTable(table);
      if (check.missing.length) throw new Error(`Thiếu cột: ${check.missing.join(', ')}. Vui lòng dùng file template.`);
      if (check.invalid.length) throw new Error(`Kiểm tra tên hoặc số tiền tại dòng Excel: ${check.invalid.join(', ')}.`);
      const next = await saveWeddingGiftList({ ...table, fileName, sheetName, headerRow });
      setData(next); setBook(null); setTable(null); setMatrix([]);
      setNotice('Đã lưu danh sách mừng cưới.');
    } catch (err) { setError(err.message || 'Không lưu được danh sách.'); }
    finally { setBusy(''); }
  }

  const shown = book ? table : data;
  const summary = useMemo(() => summarizeGiftTable(shown), [shown]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi');
    return summary.entries.filter((row) => !term || row.cells.some((cell) => cell.toLocaleLowerCase('vi').includes(term)));
  }, [summary, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / GIFT_PAGE_SIZE));
  const current = Math.min(page, pages);

  return <section className="screen is-active">
    <div className="screen__head"><h1 className="screen__title">Danh sách mừng cưới</h1><p className="screen__desc">Nhập Excel để xem danh sách. Dữ liệu này chỉ hiển thị trong trang quản trị.</p></div>
    <div className="card">
      <div className="card__actions" style={{ flexWrap: 'wrap' }}>
        <a className="btn" href="/templates/ds-mung_cuoi.xlsx" download="ds-mung_cuoi.xlsx">Tải Excel mẫu</a>
        <label className="btn btn--primary" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          {busy === 'reading' ? 'Đang đọc Excel…' : 'Tải file Excel lên'}
          <input hidden type="file" accept=".xlsx,.xls,.csv" disabled={!!busy} onChange={(e) => { const file = e.target.files[0]; e.target.value = ''; void importFile(file); }} />
        </label>
        {book && <>
          <button className="btn btn--primary" disabled={!!busy || !table?.rows.length} onClick={save} aria-busy={busy === 'saving'}>{busy === 'saving' && <span className="save-spinner" aria-hidden="true" />}{busy === 'saving' ? 'Đang lưu…' : 'Lưu danh sách'}</button>
          <button className="btn" disabled={!!busy} onClick={() => { setBook(null); setTable(null); setMatrix([]); setError(''); }}>Huỷ nhập</button>
        </>}
        {!book && <button className="btn" disabled={!!busy} onClick={load}>Tải lại</button>}
      </div>
      <p className="form__hint">Tải mẫu, điền Tên và Số tiền mừng, đánh x vào Nhà trai hoặc Nhà gái rồi tải file lên. Hỗ trợ 500k, 3 triệu, 1,5 triệu hoặc 500.000. Tổng tiền được tính ngay khi nhập; bấm Lưu danh sách để lưu lại.</p>
      {book && <div className="gift-import__options">
        <label>Sheet<select className="form__input" value={sheetName} disabled={!!busy} onChange={(e) => { try { chooseSheet(book, e.target.value); setError(''); } catch (err) { setError(err.message); } }}>{book.SheetNames.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>Dòng tiêu đề trong Excel<input className="form__input" type="number" min="1" max={matrix.length} value={headerRow} disabled={!!busy} onChange={(e) => { setHeaderRow(e.target.value); try { setTable(parser.current.buildGiftTable(matrix, e.target.value)); setError(''); } catch (err) { setTable(null); setError(err.message); } }} /></label>
      </div>}
      {busy === 'loading' && <p role="status">Đang tải danh sách…</p>}
      {error && <p role="alert" className="gift-import__error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {shown && <p className="form__hint">{book ? 'Đang xem trước' : 'Đã lưu'}: {book ? fileName : data.fileName} · Sheet {book ? sheetName : data.sheetName} · {shown.rows.length} dòng</p>}
    </div>
    {shown && !summary.missing.length && <>
      <div className="gift-import__stats">
        <div className="card"><p>{summary.invalid.length ? 'Tạm tính các dòng hợp lệ' : 'Tổng tiền mừng'}</p><strong>{money(summary.total)}</strong><p>{summary.entries.length} người / dòng</p></div>
        <div className="card"><p>Nhà trai</p><strong>{money(summary.groom)}</strong></div>
        <div className="card"><p>Nhà gái</p><strong>{money(summary.bride)}</strong></div>
        {summary.ambiguous.length > 0 && <div className="card"><p>Chưa xác định bên</p><strong>{money(summary.unassigned)}</strong><p>{summary.ambiguous.length} dòng chưa đánh dấu hoặc đánh dấu cả hai bên</p></div>}
      </div>
      <p className="form__hint">Tổng tính trên toàn bộ danh sách, không thay đổi khi tìm kiếm hoặc chuyển trang. Dòng đánh dấu cả hai bên chỉ được tính một lần vào tổng.</p>
      {summary.invalid.length > 0 && <p className="gift-import__error" role="alert">Tên hoặc số tiền chưa hợp lệ tại dòng Excel {summary.invalid.join(', ')}. Các dòng này chưa được cộng; sửa file rồi nhập lại trước khi lưu.</p>}
    </>}
    {shown && summary.missing.length > 0 && <p className="gift-import__error" role="alert">Thiếu cột {summary.missing.join(', ')}. Chọn lại dòng tiêu đề hoặc dùng Excel mẫu.</p>}
    <div className="card">
      <input className="form__input" aria-label="Tìm trong danh sách mừng cưới" placeholder="Tìm theo tên, số tiền hoặc nội dung…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {shown && !summary.missing.length ? <>
        <div className="gift-import__table"><table className="table"><thead><tr><th>STT</th><th>Tên</th><th>Số tiền mừng</th><th>Nhà trai</th><th>Nhà gái</th></tr></thead><tbody>
          {filtered.slice((current - 1) * GIFT_PAGE_SIZE, current * GIFT_PAGE_SIZE).map((row, index) => <tr key={row.excelRow}><td>{(current - 1) * GIFT_PAGE_SIZE + index + 1}</td><td>{row.name || 'Thiếu tên'}</td><td>{row.amount === null ? `${row.rawAmount || 'Trống'} (chưa hợp lệ)` : money(row.amount)}</td><td>{row.groom && <span className="gift-import__check" role="img" aria-label="Mừng nhà trai">✓</span>}</td><td>{row.bride && <span className="gift-import__check" role="img" aria-label="Mừng nhà gái">✓</span>}</td></tr>)}
          {!filtered.length && <tr><td colSpan={5}>Không tìm thấy dữ liệu.</td></tr>}
        </tbody></table></div>
        <Pagination page={current} pageSize={GIFT_PAGE_SIZE} total={filtered.length} onPageChange={setPage} label="người mừng cưới" />
      </> : <p style={{ padding: '24px 0' }}>Chưa có danh sách mừng cưới. Chọn file Excel để bắt đầu.</p>}
    </div>
  </section>;
}
