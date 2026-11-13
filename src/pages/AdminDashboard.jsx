import { useNavigate } from 'react-router-dom';
/**
 * AdminDashboard.jsx — Dashboard quản trị thiệp cưới (14 mục).
 * Port từ admin/index.html + js/admin.js gốc sang React 18.
 *
 * - Mọi đọc/ghi dữ liệu ĐI QUA lib/store.js. Không đọc/ghi localStorage trực
 *   tiếp, trừ khoá phiên/mật khẩu/chế độ tối (theo đúng spec đăng nhập).
 * - Draft: object config trong ref (sửa trực tiếp như bản gốc) + state
 *   `version` để kích hoạt render lại. Tránh deepClone toàn bộ config
 *   (có thể chứa ảnh base64 nặng) sau mỗi lần gõ phím.
 * - Autosave 1.5s sau khi ngừng sửa + nút Lưu ngay / Hoàn tác.
 * - Validate trước khi lưu (validateDraft); RIÊNG music.url KHÔNG validate
 *   định dạng URL (được phép là đường dẫn tương đối như
 *   assets/beautiful-in-white.mp3). ogImage chấp nhận thêm data:image
 *   (ảnh upload) — nếu không, cứ upload ảnh og là sẽ không lưu được.
 * - Config, lời chúc, RSVP và ảnh được lưu trên Firebase.
 * - Không dùng thêm thư viện ngoài react/react-dom nên một số chỗ khác bản
 *   gốc: cắt ảnh = center-crop tự động theo đúng tỉ lệ (không có Cropper.js
 *   tương tác), kéo-thả = HTML5 native drag & drop (không SortableJS),
 *   biểu đồ RSVP = donut SVG tự vẽ (không Chart.js), mã QR thiệp =
 *   qrcode-generator đã nạp sẵn trong admin/index.html (không QRCode CDN).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getConfig,
  saveConfig,
  resetConfig,
  exportConfig,
  importConfig,
  getWishes,
  addWish,
  deleteWish,
  approveWish,
  hideWish,
  getRsvps,
  addRsvp,
  deleteRsvp,
  updateRsvpStatus,
  storageUsage,
  uid,
  deepClone,
} from '../lib/store.js';
import { auth, changeAdminPassword, logoutAdmin, storageGet, storageSet } from '../lib/auth.js';
import { onAuthStateChanged } from 'firebase/auth';
import { DEFAULT_CONFIG } from '../lib/defaultConfig.js';
import { fmtDateShort, parseYoutubeId } from '../lib/utils.js';
import { makeGiftQrSvg, isUsableQrImage } from '../lib/qr.js';
import { Icon } from '../lib/icons.jsx';
import WeddingGiftList from '../components/WeddingGiftList.jsx';
import Pagination from '../components/Pagination.jsx';
import ImageEditor from '../components/ImageEditor.jsx';

// ------------------------------------------------------------------
// Tiện ích đường dẫn object / ngày giờ / URL / tải file
// ------------------------------------------------------------------
function getPath(obj, path) {
  return path.split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

/** ISO -> chuỗi hiển thị vi-VN (ngày + giờ). */
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** ISO "2027-02-14T09:00:00+07:00" -> giá trị cho input datetime-local. */
function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Giá trị input datetime-local -> chuỗi ISO (UTC). */
function localInputToIso(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Kiểm tra URL http(s) hợp lệ (cho phép trống = chưa nhập). */
function isValidUrl(value) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** URL ảnh hợp lệ: http(s) hoặc data:image (ảnh upload lưu base64). */
function isValidImageUrl(value) {
  if (!value) return true;
  if (/^data:image\//i.test(String(value))) return true;
  return isValidUrl(value);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Xuất mảng object thành CSV (có BOM UTF-8 để Excel đọc đúng tiếng Việt). */
function downloadCSV(filename, headers, rows) {
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [headers.map(esc).join(',')].concat(rows.map((r) => r.map(esc).join(',')));
  downloadBlob(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
}

/** URL tuyệt đối của thiệp (../index.html so với trang admin hiện tại). */
function invitationUrl() {
  return new URL('/', window.location.href).href;
}

// ------------------------------------------------------------------
// Giữ ảnh gốc; chỉ cắt khi vị trí hiển thị yêu cầu một tỉ lệ cố định.
// ------------------------------------------------------------------
/** Đọc file bất kỳ thành data URL (dùng cho nhạc mp3, ảnh QR). */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được file.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Sinh chuỗi SVG mã QR cho một chuỗi text (dùng window.qrcode đã nạp sẵn). */
function qrSvgFor(text) {
  try {
    if (typeof window === 'undefined' || typeof window.qrcode !== 'function') return null;
    if (!text) return null;
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 20, scalable: true });
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Hằng số
// ------------------------------------------------------------------
const SCREEN_TITLES = {
  overview: 'Tổng quan',
  general: 'Thông tin chung',
  couple: 'Cô dâu & Chú rể',
  gift: 'Mừng cưới',
  giftList: 'Danh sách mừng cưới',
  album: 'Album ảnh',
  events: 'Sự kiện cưới',
  video: 'Video',
  music: 'Nhạc nền',
  theme: 'Giao diện',
  guestbook: 'Sổ lưu bút',
  rsvp: 'RSVP / Khách mời',
  seo: 'SEO & Chia sẻ',
  backup: 'Sao lưu & Dữ liệu',
  account: 'Cài đặt tài khoản',
};

const MENU = [
  { id: 'overview', icon: 'grid', label: 'Tổng quan' },
  { id: 'general', icon: 'info', label: 'Thông tin chung' },
  { id: 'couple', icon: 'users', label: 'Cô dâu & Chú rể' },
  { id: 'gift', icon: 'gift', label: 'Mừng cưới' },
  { id: 'giftList', icon: 'gift', label: 'Danh sách mừng cưới' },
  { id: 'album', icon: 'image', label: 'Album ảnh' },
  { id: 'events', icon: 'calendar', label: 'Sự kiện cưới' },
  { id: 'video', icon: 'video', label: 'Video' },
  { id: 'music', icon: 'music', label: 'Nhạc nền' },
  { id: 'theme', icon: 'palette', label: 'Giao diện' },
  { id: 'guestbook', icon: 'book', label: 'Sổ lưu bút' },
  { id: 'rsvp', icon: 'checkCircle', label: 'RSVP / Khách mời' },
  { id: 'seo', icon: 'search', label: 'SEO & Chia sẻ' },
  { id: 'backup', icon: 'database', label: 'Sao lưu & Dữ liệu' },
  { id: 'account', icon: 'settings', label: 'Cài đặt tài khoản' },
];

const RSVP_STATUS_LABEL = { yes: 'Có', no: 'Không', maybe: 'Chưa chắc' };

const PRESETS = [
  { id: 'pink', name: 'Hồng phấn', colors: { primary: '#b76e79', secondary: '#8a6d5c', background: '#fdf8f5', text: '#4a3f3a' } },
  { id: 'sage', name: 'Xanh sage', colors: { primary: '#7d8c6f', secondary: '#5c6b52', background: '#f6f8f3', text: '#33392e' } },
  { id: 'champagne', name: 'Vàng champagne', colors: { primary: '#b9975b', secondary: '#8a6d3b', background: '#fdfaf3', text: '#4a4030' } },
  { id: 'red', name: 'Đỏ truyền thống', colors: { primary: '#a83232', secondary: '#7a5c2e', background: '#fdf6f3', text: '#402020' } },
  { id: 'navy', name: 'Xanh navy', colors: { primary: '#1f3a5f', secondary: '#4a6b8a', background: '#f4f6f9', text: '#1e2a38' } },
  { id: 'mono', name: 'Tối giản đen trắng', colors: { primary: '#222222', secondary: '#666666', background: '#ffffff', text: '#222222' } },
];

// ------------------------------------------------------------------
// Component dùng chung (khai báo ngoài component chính để không mất focus)
// ------------------------------------------------------------------
function Field({ label, required, hint, error, children }) {
  return (
    <div className="form__field">
      {label && (
        <label className="form__label">
          {label} {required && <span className="form__required">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="form__hint">{hint}</p>}
      {error && <p className="form__error is-show">{error}</p>}
    </div>
  );
}

function Switch({ label, desc, checked, onChange, ariaLabel }) {
  return (
    <div className="switch">
      <div>
        <div className="switch__label">{label}</div>
        {desc && <div className="switch__desc">{desc}</div>}
      </div>
      <input
        className="switch__input"
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel || label}
      />
    </div>
  );
}

/** Biểu đồ donut trạng thái RSVP (tự vẽ SVG, thay Chart.js). */
function RsvpDonut({ yes, no, maybe }) {
  const total = yes + no + maybe;
  if (!total) {
    return <p className="form__hint">Chưa có RSVP nào — biểu đồ sẽ hiện khi có khách xác nhận.</p>;
  }
  const segs = [
    { value: yes, color: '#137333', label: 'Có tham dự' },
    { value: no, color: '#b42318', label: 'Không tham dự' },
    { value: maybe, color: '#f79009', label: 'Chưa chắc' },
  ];
  let offset = 25;
  return (
    <div>
      <div className="chart-wrap">
        <svg viewBox="0 0 42 42" style={{ width: '100%', height: '100%' }} role="img" aria-label="Biểu đồ trạng thái RSVP">
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#eee" strokeWidth="6" />
          {segs.map((s) => {
            const pct = (s.value / total) * 100;
            const el =
              pct > 0 ? (
                <circle
                  key={s.label}
                  cx="21"
                  cy="21"
                  r="15.9155"
                  fill="none"
                  stroke={s.color}
                  strokeWidth="6"
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset={offset}
                />
              ) : null;
            offset -= pct;
            return el;
          })}
        </svg>
      </div>
      <ul className="checklist" style={{ marginTop: 8 }}>
        {segs.map((s) => (
          <li className="checklist__item" key={s.label}>
            <span className="checklist__icon" style={{ color: s.color }}>
              <Icon name="checkCircle" size={16} />
            </span>
            <span>
              {s.label}: <strong>{s.value}</strong>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StorageBar({ usage }) {
  if (!usage) return null;
  const over = usage.percent > 80;
  return (
    <div className={`storage-bar${over ? ' is-over' : ''}`}>
      <div className="progress">
        <div className="progress__bar" style={{ width: `${usage.percent}%` }} />
      </div>
      <div className="storage-bar__text">
        {`Đã dùng ${usage.usedMB} MB / ~5 MB (${usage.percent}%)`}
        {over ? ' — Sắp đầy bộ nhớ localStorage trên thiết bị.' : ''}
      </div>
    </div>
  );
}

function Modal({ open, title, onClose, wide, children }) {
  if (!open) return null;
  return (
    <div
      className="modal is-open"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal__box${wide ? ' modal__box--wide' : ''}`}>
        <button className="modal__close" type="button" onClick={onClose} aria-label="Đóng">
          <Icon name="x" size={20} />
        </button>
        <h2 className="modal__title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Hook kéo-thả HTML5 native: trả về handler gắn lên từng item có data-id. */
function useDragReorder() {
  const dragId = useRef(null);
  const onDragStart = (id) => (e) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(id));
    } catch {
      /* bỏ qua */
    }
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (id, onReorder) => (e) => {
    e.preventDefault();
    const from = dragId.current;
    dragId.current = null;
    if (from != null && String(from) !== String(id)) onReorder(from, id);
  };
  const onDragEnd = () => {
    dragId.current = null;
  };
  return { onDragStart, onDragOver, onDrop, onDragEnd };
}

/** Di chuyển phần tử fromId lên trước phần tử toId trong mảng (trả mảng mới). */
function moveBefore(list, fromId, toId) {
  const fromIdx = list.findIndex((x) => String(x.id ?? x) === String(fromId));
  const toIdx = list.findIndex((x) => String(x.id ?? x) === String(toId));
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list;
  const next = [...list];
  const [item] = next.splice(fromIdx, 1);
  const insertAt = next.findIndex((x) => String(x.id ?? x) === String(toId));
  next.splice(insertAt < 0 ? next.length : insertAt, 0, item);
  return next;
}

// ------------------------------------------------------------------
// Dashboard chính
// ------------------------------------------------------------------
export default function AdminDashboard() {
  const navigate = useNavigate();
  // Draft trong ref (sửa trực tiếp như bản gốc); `version` kích hoạt render.
  const draftRef = useRef(deepClone(DEFAULT_CONFIG));
  const lastSavedRef = useRef(deepClone(DEFAULT_CONFIG));
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const pendingImagesRef = useRef(new Map());
  const [imageEditor, setImageEditor] = useState(null);
  const imageEditorResolve = useRef(null);
  useEffect(() => () => { imageEditorResolve.current?.(null); }, []);
  const pendingDeletesRef = useRef(new Set());
  const dirtyRef = useRef(false);
  const [screen, setScreen] = useState('overview');
  const [authed, setAuthed] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [configLoadError, setConfigLoadError] = useState('');
  const [toasts, setToasts] = useState([]);
  const [wishes, setWishes] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [wishState, setWishState] = useState({ page: 1, perPage: 10, search: '', filter: 'all', selected: new Set() });
  const [rsvpState, setRsvpState] = useState({ page: 1, perPage: 10, search: '', status: 'all', side: 'all' });
  const [coupleTab, setCoupleTab] = useState('bride');
  const [albumSelected, setAlbumSelected] = useState(new Set());
  const [guestLinks, setGuestLinks] = useState([]);
  const [guestListText, setGuestListText] = useState('');
  const [previewDevice, setPreviewDevice] = useState('desktop');
  const [previewKey, setPreviewKey] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [invalidPaths, setInvalidPaths] = useState(new Set());
  const [storageTick, setStorageTick] = useState(0);
  const [eventModal, setEventModal] = useState(null); // null | {id?, name, date, time, venue, address, mapsUrl, image, note, mapsError}
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [wishForm, setWishForm] = useState({ name: '', email: '', message: '' });
  const [textModal, setTextModal] = useState(null); // null | {title, value, mode:'add'|'edit', index}
  const [qrSvg, setQrSvg] = useState('');
  const [qrReady, setQrReady] = useState(false);
  const [pwForm, setPwForm] = useState({ oldPw: '', newPw: '', newPw2: '' });

  const previewFrameRef = useRef(null);
  const audioRef = useRef(null);
  const toastTimersRef = useRef([]);
  const drag = useDragReorder();

  const draft = draftRef.current;

  // ---------------- Toast ----------------
  function toast(message, type = 'success') {
    const id = uid('toast');
    setToasts((prev) => [...prev, { id, message, type }]);
    const t = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 3800);
    toastTimersRef.current.push(t);
  }

  // ---------------- Danh sách lời chúc / RSVP ----------------
  async function refreshLists() {
    try {
      const [nextWishes, nextRsvps] = await Promise.all([getWishes(), getRsvps()]);
      setWishes(nextWishes);
      setRsvps(nextRsvps);
    } catch (err) {
      console.error('[dashboard] Không tải được dữ liệu Firebase:', err);
      toast(`Không tải được dữ liệu: ${err.message || 'hãy kiểm tra Firebase Rules.'}`, 'error');
    }
  }

  // ---------------- Draft: sửa + đánh dấu chưa lưu ----------------
  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
  }

  /** Render lại sau khi sửa draft trong ref. */
  function bump() {
    setVersion((v) => v + 1);
  }

  /** Sửa một đường dẫn trong draft (vd: 'couple.groom.name'). */
  function updateDraft(path, value) {
    setPath(draftRef.current, path, value);
    setInvalidPaths((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
    markDirty();
    bump();
  }

  /** Sửa draft bằng hàm tự do (push/splice mảng...), rồi render + đánh dấu. */
  function mutateDraft(fn) {
    fn(draftRef.current);
    markDirty();
    bump();
  }

  // ---------------- Validate + Lưu ----------------
  function validateDraft() {
    const d = draftRef.current;
    const problems = [];
    const req = (path, label) => {
      const v = String(getPath(d, path) ?? '').trim();
      if (!v) problems.push(label + ' là bắt buộc.');
    };
    req('couple.groom.name', 'Tên chú rể');
    req('couple.bride.name', 'Tên cô dâu');
    req('site.title', 'Tiêu đề trang (SEO)');
    const wd = new Date(d.couple.weddingDate);
    if (!d.couple.weddingDate || Number.isNaN(wd.getTime())) problems.push('Ngày giờ cưới chưa hợp lệ.');
    // LƯU Ý: music.url KHÔNG validate URL (được phép là đường dẫn tương đối).
    const urlFields = [
      ['site.domain', 'Domain website', isValidUrl],
      ['site.ogImage', 'Ảnh og:image', isValidImageUrl],
      ['video.youtubeUrl', 'Link YouTube', isValidUrl],
    ];
    for (const [path, label, check] of urlFields) {
      if (!check(getPath(d, path))) {
        problems.push(label + ' chưa đúng định dạng URL (phải bắt đầu bằng http:// hoặc https://).');
      }
    }
    if (d.rsvp.deadline && Number.isNaN(new Date(d.rsvp.deadline).getTime())) {
      problems.push('Hạn chót RSVP chưa hợp lệ.');
    }
    return problems;
  }

  function computeInvalidPaths() {
    const d = draftRef.current;
    const bad = new Set();
    if (!String(d.couple.groom.name || '').trim()) bad.add('couple.groom.name');
    if (!String(d.couple.bride.name || '').trim()) bad.add('couple.bride.name');
    if (!String(d.site.title || '').trim()) bad.add('site.title');
    if (!d.couple.weddingDate || Number.isNaN(new Date(d.couple.weddingDate).getTime())) bad.add('couple.weddingDate');
    if (!isValidUrl(d.site.domain)) bad.add('site.domain');
    if (!isValidImageUrl(d.site.ogImage)) bad.add('site.ogImage');
    if (!isValidUrl(d.video.youtubeUrl)) bad.add('video.youtubeUrl');
    if (d.rsvp.deadline && Number.isNaN(new Date(d.rsvp.deadline).getTime())) bad.add('rsvp.deadline');
    return bad;
  }

  /** Gửi message cho iframe preview để thiệp render lại. */
  function notifyPreview() {
    try {
      const frame = previewFrameRef.current;
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'wedding-config-updated' }, '*');
      }
    } catch {
      /* iframe chưa tải xong -> bỏ qua, sẽ nạp lại bằng previewKey */
    }
    setPreviewKey((k) => k + 1);
  }

  /** Lưu draft qua store.saveConfig(). Trả về true nếu lưu được. */
  async function saveNow(showToast = true) {
    if (savingRef.current) return false;
    if (!showToast && getPendingImages(draftRef.current).length) return false;
    if (!showToast && getRemovedImages(draftRef.current).length) return false;
    if (!configReady) {
      toast(configLoadError || 'Đang tải cấu hình Firebase. Vui lòng đợi rồi thử lại.', 'error');
      return false;
    }
    const problems = validateDraft();
    setInvalidPaths(computeInvalidPaths());
    if (problems.length) {
      if (showToast) toast('Chưa lưu được: ' + problems[0], 'error');
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    const snapshot = deepClone(draftRef.current);
    const removedImages = getRemovedImages(snapshot);
    try {
    for (const pending of getPendingImages(snapshot)) {
      if (!pending.url) pending.url = await uploadCloudinaryImage(pending);
    }
    const result = await saveConfig(resolveImagePreviews(snapshot));
    if (!result.ok) {
      toast('Lưu thất bại: ' + (result.error || 'lỗi không rõ.'), 'error');
      return false;
    }
    lastSavedRef.current = deepClone(result.config);
    const changedDuringSave = JSON.stringify(draftRef.current) !== JSON.stringify(snapshot);
    draftRef.current = changedDuringSave ? resolveImagePreviews(draftRef.current) : result.config;
    removedImages.forEach((url) => pendingDeletesRef.current.add(url));
    if (showToast && pendingDeletesRef.current.size) {
      const usedImages = getCloudinaryImages(draftRef.current);
      const token = await auth.currentUser.getIdToken();
      let failed = 0;
      for (const url of pendingDeletesRef.current) {
        if (usedImages.has(url)) { pendingDeletesRef.current.delete(url); continue; }
        try {
          const response = await fetch('/api/cloudinary/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ url }),
          });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.error);
          pendingDeletesRef.current.delete(url);
        } catch { failed++; }
      }
      if (failed) toast(`Cấu hình đã lưu nhưng ${failed} ảnh chưa xoá khỏi Cloudinary. Bấm Lưu để thử lại.`, 'error');
    }
    dirtyRef.current = changedDuringSave;
    setDirty(changedDuringSave);
    bump();
    if (showToast) toast('Đã lưu thay đổi ✓');
    notifyPreview();
    setStorageTick((t) => t + 1);
    return true;
    } catch (err) {
      toast('Lưu thất bại: ' + (err.message || 'Vui lòng thử lại.'), 'error');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleUndo() {
    draftRef.current = deepClone(lastSavedRef.current);
    pendingImagesRef.current.clear();
    dirtyRef.current = false;
    setDirty(false);
    setInvalidPaths(new Set());
    bump();
    notifyPreview();
    toast('Đã hoàn tác về bản đã lưu gần nhất ✓');
  }

  async function handleLogout() {
    try {
      await logoutAdmin();
      navigate('/admin/login', { replace: true });
    } catch (err) {
      toast(`Đăng xuất thất bại: ${err.message || 'hãy thử lại.'}`, 'error');
    }
  }

  // ---------------- Upload ảnh ----------------
  function getPendingImages(config) {
    const pending = new Set();
    JSON.stringify(config, (_key, value) => {
      if (typeof value === 'string' && pendingImagesRef.current.has(value)) {
        pending.add(pendingImagesRef.current.get(value));
      }
      return value;
    });
    return [...pending];
  }

  function getCloudinaryImages(config) {
    const urls = new Set();
    const prefix = `https://res.cloudinary.com/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload/`;
    JSON.stringify(resolveImagePreviews(config), (_key, value) => {
      if (typeof value === 'string' && value.startsWith(prefix)) urls.add(value);
      return value;
    });
    return urls;
  }

  function getRemovedImages(config) {
    const next = getCloudinaryImages(config);
    return [...getCloudinaryImages(lastSavedRef.current)].filter((url) => !next.has(url));
  }

  function resolveImagePreviews(config) {
    return JSON.parse(JSON.stringify(config, (_key, value) =>
      typeof value === 'string' ? pendingImagesRef.current.get(value)?.url || value : value,
    ));
  }

  async function uploadCloudinaryImage({ blob, name }) {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !uploadPreset) throw new Error('Thiếu cấu hình Cloudinary trong .env.');
    const form = new FormData();
    form.append('file', blob, name);
    form.append('upload_preset', uploadPreset);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
      method: 'POST', body: form,
    });
    const result = await response.json();
    if (!response.ok || !result.secure_url) throw new Error(result.error?.message || 'Cloudinary không tải được ảnh.');
    return result.secure_url;
  }

  /** Chỉ chuẩn bị ảnh xem trước; Cloudinary được gọi khi bấm Lưu thay đổi. */
  async function uploadImage(file, { cropAspect = null } = {}) {
    if (!file || !file.type.startsWith('image/')) {
      toast('Vui lòng chọn file ảnh.', 'error');
      return null;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('Ảnh vượt quá giới hạn 10 MB.', 'error');
      return null;
    }
    try {
      const original = await readFileAsDataUrl(file);
      const edited = await new Promise((resolve) => {
        imageEditorResolve.current = resolve;
        setImageEditor({ source: original, aspect: cropAspect, resolve });
      });
      if (!edited) return null;
      const dataUrl = edited.original ? original : edited.dataUrl;
      const blob = edited.original ? file : edited.blob;
      if (blob.size > 10 * 1024 * 1024) {
        throw new Error('Ảnh PNG sau khi cắt vượt quá 10 MB. Vui lòng chọn ảnh có dung lượng nhỏ hơn.');
      }
      if (!pendingImagesRef.current.has(dataUrl)) {
        const name = edited.original ? file.name : file.name.replace(/\.[^.]+$/, '') + '.png';
        pendingImagesRef.current.set(dataUrl, { blob, name, url: '' });
      }
      return dataUrl;
    } catch (err) {
      toast(err.message || 'Không xử lý được ảnh.', 'error');
      return null;
    }
  }

  // ---------------- Effects ----------------
  // Xác thực Firebase, nạp cấu hình và dữ liệu cloud.
  useEffect(() => {
    let alive = true;
    const darkOn = storageGet(localStorage, 'wedding_admin_dark') === '1';
    setDark(darkOn);
    document.body.classList.toggle('admin--dark', darkOn);
    // Mã QR của thiệp (SEO) — sinh 1 lần, URL thiệp không đổi.
    const svg = qrSvgFor(invitationUrl());
    if (svg) {
      setQrSvg(svg);
      setQrReady(true);
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/admin/login', { replace: true });
        return;
      }
      try {
        const config = await getConfig();
        if (!alive) return;
        draftRef.current = config;
        lastSavedRef.current = deepClone(config);
        setConfigReady(true);
        setConfigLoadError('');
        setAuthed(true);
        await refreshLists();
      } catch (err) {
        if (alive) {
          setAuthed(true);
          setConfigLoadError(`Không tải được cấu hình Firebase: ${err.message || 'hãy kiểm tra Firestore Rules.'}`);
          toast(`Không tải được cấu hình: ${err.message || 'hãy kiểm tra Firestore Rules.'}`, 'error');
        }
      }
    });
    const onBeforeUnload = (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    const timers = toastTimersRef.current;
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener('beforeunload', onBeforeUnload);
      timers.forEach((t) => clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave: 1.5s sau lần sửa cuối cùng.
  useEffect(() => {
    if (!dirty || !configReady || saving) return undefined;
    if (getPendingImages(draftRef.current).length) return undefined;
    if (getRemovedImages(draftRef.current).length) return undefined;
    const t = setTimeout(() => { void saveNow(false); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, version, configReady, saving]);

  // Đổi màn hình: về đầu trang + tải lại dữ liệu tươi cho các màn có bảng.
  useEffect(() => {
    if (!authed) return;
    window.scrollTo({ top: 0 });
    if (screen === 'overview' || screen === 'guestbook' || screen === 'rsvp') refreshLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, authed]);

  // Đồng bộ âm lượng thẻ audio khi draft.music.volume đổi.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = draft.music.volume ?? 0.5;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.music.volume, version]);

  function showScreen(id) {
    setScreen(id);
    setSidebarOpen(false);
  }

  function applyDarkMode(on) {
    setDark(on);
    document.body.classList.toggle('admin--dark', on);
    try {
      storageSet(localStorage, 'wedding_admin_dark', on ? '1' : '0');
    } catch {
      /* bỏ qua */
    }
    toast(on ? 'Đã bật chế độ tối' : 'Đã tắt chế độ tối');
  }

  // ---------------- Dữ liệu dẫn xuất ----------------
  const usage = useMemo(() => storageUsage(), [storageTick, version]);
  const videoId = parseYoutubeId(draft.video.youtubeUrl);
  const musicUrl = String(draft.music.url || '').trim();

  // Lọc + phân trang lời chúc
  const filteredWishesList = useMemo(() => {
    const q = wishState.search.trim().toLowerCase();
    return wishes.filter((w) => {
      if (wishState.filter === 'approved' && !w.approved) return false;
      if (wishState.filter === 'pending' && w.approved) return false;
      if (
        q &&
        !(
          String(w.name).toLowerCase().includes(q) ||
          String(w.email || '').toLowerCase().includes(q) ||
          String(w.message).toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [wishes, wishState.search, wishState.filter]);

  const wishPages = Math.max(1, Math.ceil(filteredWishesList.length / wishState.perPage));
  const wishPage = Math.min(wishState.page, wishPages);
  const wishPageItems = filteredWishesList.slice(
    (wishPage - 1) * wishState.perPage,
    wishPage * wishState.perPage,
  );

  // Lọc + phân trang RSVP
  const filteredRsvpsList = useMemo(() => {
    const q = rsvpState.search.trim().toLowerCase();
    return rsvps.filter((r) => {
      if (rsvpState.status !== 'all' && r.status !== rsvpState.status) return false;
      if (rsvpState.side !== 'all') {
        const side = String(r.side || '').toLowerCase();
        if (rsvpState.side === 'trai' && !side.includes('trai')) return false;
        if (rsvpState.side === 'gai' && !side.includes('gái') && !side.includes('gai')) return false;
      }
      if (
        q &&
        !(
          String(r.name).toLowerCase().includes(q) ||
          String(r.phone || '').includes(q) ||
          String(r.message || '').toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [rsvps, rsvpState.search, rsvpState.status, rsvpState.side]);

  const rsvpPages = Math.max(1, Math.ceil(filteredRsvpsList.length / rsvpState.perPage));
  const rsvpPage = Math.min(rsvpState.page, rsvpPages);
  const rsvpPageItems = filteredRsvpsList.slice(
    (rsvpPage - 1) * rsvpState.perPage,
    rsvpPage * rsvpState.perPage,
  );

  const rsvpYes = rsvps.filter((r) => r.status === 'yes');
  const rsvpNo = rsvps.filter((r) => r.status === 'no');
  const rsvpMaybe = rsvps.filter((r) => r.status === 'maybe');
  const guestsTotal = rsvpYes.reduce((sum, r) => sum + (Number(r.guests) || 0), 0);

  if (!authed) return null;

  const invalid = (path) => (invalidPaths.has(path) ? ' form__input--invalid' : '');

  // ==================================================================
  // 1. TỔNG QUAN
  // ==================================================================
  function renderOverview() {
    const wedding = new Date(draft.couple.weddingDate);
    let daysText = '—';
    if (!Number.isNaN(wedding.getTime())) {
      const diff = Math.ceil((wedding.getTime() - Date.now()) / 86400000);
      daysText = diff > 0 ? String(diff) : diff === 0 ? 'Hôm nay!' : 'Đã qua ' + Math.abs(diff) + ' ngày';
    }
    const pendingWishes = wishes.filter((w) => !w.approved).length;
    const isDefaultName = (name) => !name || name === 'Tên Chú Rể' || name === 'Tên Cô Dâu';
    const checks = [
      { label: 'Đã điền tên thật của cô dâu & chú rể (khác tên mẫu)', done: !isDefaultName(draft.couple.groom.name) && !isDefaultName(draft.couple.bride.name) },
      { label: 'Đã đặt ngày cưới', done: !!draft.couple.weddingDate && !Number.isNaN(new Date(draft.couple.weddingDate).getTime()) },
      { label: 'Đã có ảnh hero', done: (draft.couple.heroImages || []).length > 0 },
      { label: 'Đã có ít nhất 1 sự kiện cưới', done: (draft.events.items || []).length > 0 },
      { label: 'Đã có ảnh trong album', done: (draft.album.photos || []).length > 0 },
      { label: 'Đã có video cưới (link YouTube)', done: !!videoId },
      { label: 'Đã có nhạc nền', done: !!musicUrl },
      // Mục "Chuyện tình yêu" đã thay bằng "Mừng cưới": checklist theo mục mới.
      { label: 'Đã nhập thông tin mừng cưới (số tài khoản chú rể & cô dâu)', done: !!String(draft.gift?.groom?.accountNumber || '').trim() && !!String(draft.gift?.bride?.accountNumber || '').trim() },
      { label: 'Đã điền tiêu đề SEO', done: !!String(draft.site.title || '').trim() && draft.site.title !== 'Tên Chú Rể & Tên Cô Dâu — Thiệp Cưới Online' },
      { label: 'Đã có ảnh chia sẻ (og:image)', done: !!String(draft.site.ogImage || '').trim() },
    ];
    const doneCount = checks.filter((c) => c.done).length;
    const percent = Math.round((doneCount / checks.length) * 100);
    const latest = wishes.slice(0, 5);

    return (
      <section className="screen is-active" id="screen-overview" data-title="Tổng quan">
        <div className="screen__head">
          <h1 className="screen__title">Tổng quan</h1>
          <p className="screen__desc">Tình hình thiệp cưới của bạn trong nháy mắt.</p>
        </div>
        <div className="grid grid--4">
          <div className="stat">
            <div className="stat__label">Ngày còn lại đến đám cưới</div>
            <div className="stat__value">{daysText}</div>
            <div className="stat__sub">{fmtDateTime(draft.couple.weddingDate)}</div>
          </div>
          <div className="stat">
            <div className="stat__label">Lời chúc đã nhận</div>
            <div className="stat__value">{wishes.length}</div>
            <div className="stat__sub">{pendingWishes} đang chờ duyệt</div>
          </div>
          <div className="stat">
            <div className="stat__label">Khách xác nhận tham dự</div>
            <div className="stat__value">{rsvpYes.length}</div>
            <div className="stat__sub">{rsvps.length} RSVP tất cả</div>
          </div>
          <div className="stat">
            <div className="stat__label">Tổng số khách dự kiến</div>
            <div className="stat__value">{guestsTotal}</div>
            <div className="stat__sub">Tổng trường guests của RSVP “Có”</div>
          </div>
        </div>
        <div className="grid grid--2" style={{ marginTop: 16 }}>
          <div className="card">
            <h2 className="card__title">Trạng thái RSVP</h2>
            <p className="card__subtitle">Có / Không / Chưa chắc</p>
            <RsvpDonut yes={rsvpYes.length} no={rsvpNo.length} maybe={rsvpMaybe.length} />
          </div>
          <div className="card">
            <h2 className="card__title">
              Hoàn thiện thiệp — <span>{percent}%</span>
            </h2>
            <p className="card__subtitle">Điền đủ các mục dưới đây để thiệp sẵn sàng gửi khách.</p>
            <div className="progress" style={{ marginBottom: 12 }}>
              <div className="progress__bar" style={{ width: `${percent}%` }} />
            </div>
            <ul className="checklist">
              {checks.map((c) => (
                <li className={`checklist__item${c.done ? ' is-done' : ''}`} key={c.label}>
                  <span className="checklist__icon" style={{ color: c.done ? '#137333' : undefined }}>
                    <Icon name={c.done ? 'checkCircle' : 'square'} size={16} />
                  </span>
                  <span>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="card">
          <h2 className="card__title">5 lời chúc mới nhất</h2>
          <p className="card__subtitle">Bấm vào mục “Sổ lưu bút” để duyệt, ẩn hoặc xoá.</p>
          {latest.length === 0 ? (
            <p className="form__hint">Chưa có lời chúc nào.</p>
          ) : (
            latest.map((w) => (
              <div className="wish-mini" key={w.id}>
                <strong>{w.name}</strong>{' '}
                {w.approved ? (
                  <span className="badge badge--yes">Đã duyệt</span>
                ) : (
                  <span className="badge badge--maybe">Chờ duyệt</span>
                )}
                <div>{w.message}</div>
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  // ==================================================================
  // 2. THÔNG TIN CHUNG
  // ==================================================================
  async function handleHeroFile(file) {
    const dataUrl = await uploadImage(file, { cropAspect: 16 / 9, cropTitle: 'Cắt ảnh hero (16:9)' });
    if (!dataUrl) return;
    mutateDraft((d) => {
      d.couple.heroImages = d.couple.heroImages || [];
      d.couple.heroImages.push(dataUrl);
    });
    toast('Đã thêm ảnh hero ✓');
  }

  function handleAddHeroUrl(url, clear) {
    const value = url.trim();
    if (!value) {
      toast('Hãy dán URL ảnh trước.', 'error');
      return;
    }
    if (!isValidUrl(value)) {
      toast('URL ảnh chưa đúng định dạng.', 'error');
      return;
    }
    mutateDraft((d) => {
      d.couple.heroImages = d.couple.heroImages || [];
      d.couple.heroImages.push(value);
    });
    clear();
    toast('Đã thêm ảnh hero ✓');
  }

  function handleSuggestMonogram() {
    const firstLetter = (name) => {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      return parts.length ? parts[parts.length - 1][0].toUpperCase() : '';
    };
    const g = firstLetter(draft.couple.groom.name);
    const b = firstLetter(draft.couple.bride.name);
    if (!g || !b) {
      toast('Hãy nhập tên cô dâu và chú rể trước.', 'error');
      return;
    }
    updateDraft('couple.monogram', g + ' & ' + b);
    toast('Đã gợi ý monogram: ' + g + ' & ' + b);
  }

  function renderGeneral() {
    const heroImages = draft.couple.heroImages || [];
    return (
      <section className="screen is-active" id="screen-general" data-title="Thông tin chung">
        <div className="screen__head">
          <h1 className="screen__title">Thông tin chung</h1>
          <p className="screen__desc">Tên cặp đôi, ngày cưới, lời chào và ảnh nền hero.</p>
        </div>
        <div className="card">
          <h2 className="card__title">Cặp đôi</h2>
          <div className="form__row form__row--2">
            <Field label="Tên chú rể" required>
              <input
                className={`form__input${invalid('couple.groom.name')}`}
                value={draft.couple.groom.name || ''}
                onChange={(e) => updateDraft('couple.groom.name', e.target.value)}
                required
                placeholder="Ví dụ: Nguyễn Văn An"
              />
            </Field>
            <Field label="Tên cô dâu" required>
              <input
                className={`form__input${invalid('couple.bride.name')}`}
                value={draft.couple.bride.name || ''}
                onChange={(e) => updateDraft('couple.bride.name', e.target.value)}
                required
                placeholder="Ví dụ: Trần Thị Bình"
              />
            </Field>
          </div>
          <div className="form__row form__row--2">
            <Field label="Thứ tự hiển thị tên">
              <select
                className="form__select"
                value={draft.couple.order || 'groomFirst'}
                onChange={(e) => updateDraft('couple.order', e.target.value)}
              >
                <option value="groomFirst">Chú rể trước</option>
                <option value="brideFirst">Cô dâu trước</option>
              </select>
            </Field>
            <Field label="Monogram (chữ viết tắt làm logo)">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form__input"
                  value={draft.couple.monogram || ''}
                  onChange={(e) => updateDraft('couple.monogram', e.target.value)}
                  placeholder="Ví dụ: A & B"
                />
                <button className="btn" type="button" onClick={handleSuggestMonogram}>
                  Gợi ý từ tên
                </button>
              </div>
            </Field>
          </div>
        </div>
        <div className="card">
          <h2 className="card__title">Ngày cưới &amp; lời chào</h2>
          <Field
            label="Ngày giờ cưới (dùng cho đồng hồ đếm ngược)"
            required
            hint="Chọn ngày giờ chính của lễ cưới. Đồng hồ đếm ngược trên thiệp tính từ mốc này."
          >
            <input
              className={`form__input${invalid('couple.weddingDate')}`}
              type="datetime-local"
              value={isoToLocalInput(draft.couple.weddingDate)}
              onChange={(e) => updateDraft('couple.weddingDate', localInputToIso(e.target.value))}
              required
            />
          </Field>
          <Field label="Tagline (dòng chữ trên hero)">
            <input
              className="form__input"
              value={draft.couple.tagline || ''}
              onChange={(e) => updateDraft('couple.tagline', e.target.value)}
              placeholder="We're getting married"
            />
          </Field>
          <Field label="Slogan / câu trích dẫn cuối thiệp">
            <textarea
              className="form__textarea"
              value={draft.couple.slogan || ''}
              onChange={(e) => updateDraft('couple.slogan', e.target.value)}
            />
          </Field>
          <Field label="Nội dung nút kêu gọi (CTA) ở hero">
            <input
              className="form__input"
              value={draft.couple.ctaText || ''}
              onChange={(e) => updateDraft('couple.ctaText', e.target.value)}
              placeholder="Xác nhận tham dự"
            />
          </Field>
          <Field label="Domain / URL website" hint="Dùng làm domain hiển thị khi chia sẻ link và trong thẻ SEO.">
            <input
              className={`form__input${invalid('site.domain')}`}
              type="url"
              value={draft.site.domain || ''}
              onChange={(e) => updateDraft('site.domain', e.target.value)}
              placeholder="https://thiepcuoi-cua-ban.vn"
            />
          </Field>
        </div>
        <div className="card">
          <h2 className="card__title">Ảnh nền hero</h2>
          <p className="card__subtitle">Ảnh đầu tiên là ảnh hiển thị đầu. Ảnh được cắt giữa theo tỉ lệ 16:9, giữ độ phân giải vùng cắt.</p>
          <div className="hero-list">
            {heroImages.length === 0 && (
              <p className="form__hint">Chưa có ảnh hero nào. Upload hoặc dán URL ảnh ở dưới.</p>
            )}
            {heroImages.map((src, i) => (
              <div className="hero-item" key={`${src.slice(0, 40)}-${i}`}>
                <img src={src} alt={`Ảnh hero ${i + 1}`} />
                <div className="hero-item__meta">
                  {i === 0 && (
                    <>
                      <strong>Ảnh đầu (hiển thị đầu tiên)</strong>
                      <br />
                    </>
                  )}
                  {String(src).length > 60 ? String(src).slice(0, 60) + '…' : String(src)}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {i !== 0 && (
                    <button
                      className="btn btn--sm"
                      type="button"
                      onClick={() => {
                        mutateDraft((d) => {
                          const [img] = d.couple.heroImages.splice(i, 1);
                          d.couple.heroImages.unshift(img);
                        });
                        toast('Đã đặt làm ảnh hero đầu tiên ✓');
                      }}
                    >
                      Đặt làm ảnh đầu
                    </button>
                  )}
                  <button
                    className="btn btn--danger btn--sm"
                    type="button"
                    onClick={() => {
                      mutateDraft((d) => {
                        d.couple.heroImages.splice(i, 1);
                      });
                    }}
                  >
                    Xoá
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="card__actions">
            <label className="btn" htmlFor="heroFileInput">
              <Icon name="upload" size={15} /> Chọn &amp; chỉnh ảnh</label>
            <><input
              type="file"
              id="heroFileInput"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (f) handleHeroFile(f);
              }}
            /></>
          </div>
          <div className="form__row" style={{ marginTop: 12 }}>
            <Field label="Hoặc dán URL ảnh">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form__input"
                  type="url"
                  placeholder="https://…/anh.jpg"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddHeroUrl(e.target.value, () => {
                        e.target.value = '';
                      });
                    }
                  }}
                  id="heroUrlInput"
                />
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('heroUrlInput');
                    if (input) handleAddHeroUrl(input.value, () => { input.value = ''; });
                  }}
                >
                  Thêm
                </button>
              </div>
            </Field>
          </div>
          <Switch
            label="Bật slideshow ảnh hero"
            desc="Tự chạy qua các ảnh hero (nếu có nhiều hơn 1 ảnh)."
            checked={draft.couple.heroSlideshow}
            onChange={(v) => updateDraft('couple.heroSlideshow', v)}
            ariaLabel="Bật slideshow ảnh hero"
          />
        </div>
      </section>
    );
  }

  // ==================================================================
  // 3. CÔ DÂU & CHÚ RỂ
  // ==================================================================
  async function handlePersonPhoto(person, file) {
    const dataUrl = await uploadImage(file, { cropAspect: 1 });
    if (!dataUrl) return;
    updateDraft(`couple.${person}.photo`, dataUrl);
    toast('Đã cập nhật ảnh ✓');
  }

  function renderCouplePerson(key, label) {
    const person = draft.couple[key] || {};
    return (
      <div className="card" key={key}>
        <h2 className="card__title">{label}</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
          <img className="avatar-preview" src={person.photo || ''} alt={`Ảnh ${label}`} />
          <div>
            <label className="btn btn--sm" htmlFor={`photoFile-${key}`}>
              <Icon name="upload" size={14} /> Chọn &amp; chỉnh ảnh</label>
            <><input
              type="file"
              id={`photoFile-${key}`}
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (f) handlePersonPhoto(key, f);
              }}
            /></>
            <p className="form__hint">Chọn ảnh và điều chỉnh vùng cắt, tỉ lệ hoặc zoom trước khi áp dụng.</p>
          </div>
        </div>
        <Field label="Họ tên" required>
          <input
            className={`form__input${invalid(`couple.${key}.name`)}`}
            value={person.name || ''}
            onChange={(e) => updateDraft(`couple.${key}.name`, e.target.value)}
            required
          />
        </Field>
        <div className="form__row form__row--2">
          <Field label="Tên bố">
            <input
              className="form__input"
              value={person.father || ''}
              onChange={(e) => updateDraft(`couple.${key}.father`, e.target.value)}
            />
          </Field>
          <Field label="Tên mẹ">
            <input
              className="form__input"
              value={person.mother || ''}
              onChange={(e) => updateDraft(`couple.${key}.mother`, e.target.value)}
            />
          </Field>
        </div>
        <Field label="Giới thiệu (hỗ trợ emoji)">
          <textarea
            className="form__textarea"
            value={person.bio || ''}
            onChange={(e) => updateDraft(`couple.${key}.bio`, e.target.value)}
          />
          <div className="form__charcount">{String(person.bio || '').length} ký tự</div>
        </Field>
        <Switch
          label="Hiển thị dòng “Con ông / Con bà”"
          checked={person.showParents}
          onChange={(v) => updateDraft(`couple.${key}.showParents`, v)}
          ariaLabel="Hiển thị tên bố mẹ"
        />
        <div style={{ marginTop: 14 }}>
          <Field label="URL ảnh (hoặc dán link ảnh thay cho upload)">
            <input
              className="form__input"
              type="url"
              value={person.photo || ''}
              onChange={(e) => updateDraft(`couple.${key}.photo`, e.target.value)}
            />
          </Field>
        </div>
      </div>
    );
  }

  function renderCouple() {
    return (
      <section className="screen is-active" id="screen-couple" data-title="Cô dâu & Chú rể">
        <div className="screen__head">
          <h1 className="screen__title">Cô dâu &amp; Chú rể</h1>
          <p className="screen__desc">Ảnh, tên, gia đình và lời giới thiệu của từng người.</p>
        </div>
        <div className="tabs" role="tablist">
          <button
            className={`tabs__btn${coupleTab === 'bride' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setCoupleTab('bride')}
          >
            Cô dâu
          </button>
          <button
            className={`tabs__btn${coupleTab === 'groom' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setCoupleTab('groom')}
          >
            Chú rể
          </button>
        </div>
        {coupleTab === 'bride' ? renderCouplePerson('bride', 'Cô dâu') : renderCouplePerson('groom', 'Chú rể')}
      </section>
    );
  }

  // ==================================================================
  // 4. MỪNG CƯỚI (thay mục "Chuyện tình yêu" của bản gốc)
  // ==================================================================
  async function handleGiftQrUpload(person, file) {
    if (!file || !file.type.startsWith('image/')) {
      toast('Vui lòng chọn file ảnh.', 'error');
      return;
    }
    try {
        const dataUrl = await uploadImage(file);
        if (!dataUrl) return;
      updateDraft(`gift.${person}.qrImage`, dataUrl);
      toast('Đã cập nhật ảnh QR ✓');
    } catch (err) {
      toast(err.message || 'Không đọc được ảnh QR.', 'error');
    }
  }

  function renderGiftPerson(key, label) {
    const person = draft.gift?.[key] || {};
    const qrSvg = makeGiftQrSvg({
      bank: person.bank,
      accountNumber: person.accountNumber,
      accountName: person.accountName,
    });
    return (
      <div className="card" key={key}>
        <h2 className="card__title">{label}</h2>
        <Field label="Ngân hàng">
          <input
            className="form__input"
            value={person.bank || ''}
            onChange={(e) => updateDraft(`gift.${key}.bank`, e.target.value)}
            placeholder="Ví dụ: Vietcombank"
          />
        </Field>
        <Field label="Số tài khoản">
          <input
            className="form__input"
            value={person.accountNumber || ''}
            onChange={(e) => updateDraft(`gift.${key}.accountNumber`, e.target.value)}
            placeholder="Ví dụ: 0123456789"
          />
        </Field>
        <Field label="Chủ tài khoản">
          <input
            className="form__input"
            value={person.accountName || ''}
            onChange={(e) => updateDraft(`gift.${key}.accountName`, e.target.value)}
            placeholder="Ví dụ: NGUYEN VAN AN"
          />
        </Field>
        <Field label="Ảnh QR (URL hoặc upload)">
          <input
            className="form__input"
            type="url"
            value={person.qrImage || ''}
            onChange={(e) => updateDraft(`gift.${key}.qrImage`, e.target.value)}
            placeholder="https://…/qr.png hoặc assets/qr-groom.png"
          />
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label className="btn btn--sm" htmlFor={`giftQrFile-${key}`}>
              <Icon name="upload" size={14} /> Chọn &amp; chỉnh ảnh</label>
            <><input
              type="file"
              id={`giftQrFile-${key}`}
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (f) handleGiftQrUpload(key, f);
              }}
            /></>
            {person.qrImage && (
              <button className="btn btn--danger btn--sm" type="button" onClick={() => updateDraft(`gift.${key}.qrImage`, '')}>
                Xoá ảnh QR
              </button>
            )}
          </div>
        </Field>
        <p className="form__label">Xem trước mã QR</p>
        <div className="qr-wrap" style={{ textAlign: 'left' }}>
          {isUsableQrImage(person.qrImage) ? (
            <img src={person.qrImage} alt={`Mã QR mừng cưới ${label}`} style={{ maxWidth: 200, display: 'block' }} />
          ) : qrSvg ? (
            <div
              style={{ maxWidth: 200 }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              aria-label={`Mã QR mừng cưới ${label}`}
            />
          ) : (
            <p className="form__hint">Chưa sinh được mã QR — hãy nhập số tài khoản hoặc upload ảnh QR.</p>
          )}
        </div>
      </div>
    );
  }

  function renderGift() {
    const gift = draft.gift || {};
    return (
      <section className="screen is-active" id="screen-gift" data-title="Mừng cưới">
        <div className="screen__head">
          <h1 className="screen__title">Mừng cưới</h1>
          <p className="screen__desc">Tài khoản nhận mừng cưới của chú rể và cô dâu.</p>
        </div>
        <div className="card">
          <Switch
            label="Hiển thị section Mừng cưới trên thiệp"
            checked={gift.enabled}
            onChange={(v) => updateDraft('gift.enabled', v)}
            ariaLabel="Bật section mừng cưới"
          />
          <div style={{ marginTop: 14 }}>
            <Field label="Tiêu đề section">
              <input
                className="form__input"
                value={gift.title || ''}
                onChange={(e) => updateDraft('gift.title', e.target.value)}
              />
            </Field>
            <Field label="Phụ đề section">
              <textarea
                className="form__textarea"
                value={gift.subtitle || ''}
                onChange={(e) => updateDraft('gift.subtitle', e.target.value)}
              />
            </Field>
          </div>
        </div>
        {renderGiftPerson('groom', 'Chú rể')}
        {renderGiftPerson('bride', 'Cô dâu')}
      </section>
    );
  }

  // ==================================================================
  // 5. ALBUM ẢNH
  // ==================================================================
  async function addAlbumFiles(files) {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!list.length) {
      toast('Vui lòng chọn file ảnh.', 'error');
      return;
    }
    let added = 0;
    for (const file of list) {
      const dataUrl = await uploadImage(file);
      if (!dataUrl) continue;
      mutateDraft((d) => {
        d.album.photos = d.album.photos || [];
        d.album.photos.push({ id: uid('photo'), src: dataUrl, caption: '', cover: d.album.photos.length === 0 });
      });
      added++;
    }
    if (added) {
      setStorageTick((t) => t + 1);
      toast(`Đã thêm ${added} ảnh vào album ✓`);
    }
  }

  function handleAddAlbumUrl() {
    const input = document.getElementById('albumUrlInput');
    const url = (input?.value || '').trim();
    if (!url) {
      toast('Hãy dán URL ảnh trước.', 'error');
      return;
    }
    if (!isValidUrl(url)) {
      toast('URL ảnh chưa đúng định dạng.', 'error');
      return;
    }
    mutateDraft((d) => {
      d.album.photos = d.album.photos || [];
      d.album.photos.push({ id: uid('photo'), src: url, caption: '', cover: d.album.photos.length === 0 });
    });
    if (input) input.value = '';
    toast('Đã thêm ảnh từ URL ✓');
  }

  function renderAlbum() {
    const photos = draft.album.photos || [];
    return (
      <section className="screen is-active" id="screen-album" data-title="Album ảnh">
        <div className="screen__head">
          <h1 className="screen__title">Album ảnh</h1>
          <p className="screen__desc">Upload, kéo thả sắp xếp, đặt bìa và ghi caption cho từng ảnh.</p>
        </div>
        <div className="card">
          <Field label="Tiêu đề album">
            <input
              className="form__input"
              value={draft.album.title || ''}
              onChange={(e) => updateDraft('album.title', e.target.value)}
            />
          </Field>
          <Field label="Phụ đề album">
            <input
              className="form__input"
              value={draft.album.subtitle || ''}
              onChange={(e) => updateDraft('album.subtitle', e.target.value)}
            />
          </Field>
          <Field label="Số cột hiển thị trên desktop">
            <select
              className="form__select"
              value={String(draft.album.columns ?? 3)}
              onChange={(e) => updateDraft('album.columns', parseInt(e.target.value, 10) || 3)}
            >
              <option value="2">2 cột</option>
              <option value="3">3 cột</option>
              <option value="4">4 cột</option>
            </select>
          </Field>
          <Switch
            label="Hiển thị album trên thiệp"
            checked={draft.album.enabled}
            onChange={(v) => updateDraft('album.enabled', v)}
            ariaLabel="Bật album"
          />
        </div>
        <div className="card">
          <h2 className="card__title">Dung lượng lưu trữ</h2>
          <StorageBar usage={usage} />
          <p className="form__hint">Ảnh upload lưu dạng base64 trong trình duyệt (giới hạn ~5MB). Dán URL ảnh từ CDN để tiết kiệm dung lượng.</p>
        </div>
        <div className="card">
          <div
            className="dropzone"
            id="albumDropzone"
            tabIndex={0}
            role="button"
            aria-label="Kéo thả ảnh vào đây hoặc bấm để chọn file"
            onClick={() => document.getElementById('albumFileInput')?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                document.getElementById('albumFileInput')?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add('is-drag');
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove('is-drag')}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('is-drag');
              addAlbumFiles(e.dataTransfer.files);
            }}
          >
            <div className="dropzone__icon">
              <Icon name="camera" size={30} />
            </div>
            <div>
              <strong>Kéo thả ảnh vào đây</strong> hoặc bấm để chọn nhiều ảnh cùng lúc
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>
              Ảnh giữ nguyên định dạng và độ phân giải gốc, tối đa 10 MB mỗi ảnh. Bấm Lưu thay đổi để tải ảnh lên.
            </div>
            <><input
              type="file"
              id="albumFileInput"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addAlbumFiles(e.target.files);
                e.target.value = '';
              }}
            /></>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Hoặc dán URL ảnh (thêm từ CDN)">
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form__input" id="albumUrlInput" type="url" placeholder="https://…/anh.jpg" />
                <button className="btn" type="button" onClick={handleAddAlbumUrl}>
                  Thêm ảnh
                </button>
              </div>
            </Field>
          </div>
          <div className="card__actions">
            <button
              className="btn btn--danger btn--sm"
              type="button"
              disabled={albumSelected.size === 0}
              onClick={() => {
                if (!albumSelected.size) return;
                if (!window.confirm(`Xoá ${albumSelected.size} ảnh đã chọn?`)) return;
                mutateDraft((d) => {
                  d.album.photos = d.album.photos.filter((p) => !albumSelected.has(p.id));
                  if (!d.album.photos.some((p) => p.cover) && d.album.photos.length) d.album.photos[0].cover = true;
                });
                setAlbumSelected(new Set());
                toast('Đã xoá các ảnh đã chọn ✓');
              }}
            >
              <Icon name="trash" size={14} /> Xoá ảnh đã chọn (<span>{albumSelected.size}</span>)
            </button>
          </div>
          <ul className="album-grid" style={{ marginTop: 14 }}>
            {photos.map((p) => (
              <li
                key={p.id}
                className={`album-item${albumSelected.has(p.id) ? ' is-selected' : ''}`}
                draggable
                onDragStart={drag.onDragStart(p.id)}
                onDragOver={drag.onDragOver}
                onDrop={drag.onDrop(p.id, (from, to) => {
                  mutateDraft((d) => {
                    d.album.photos = moveBefore(d.album.photos, from, to);
                  });
                })}
                onDragEnd={drag.onDragEnd}
              >
                <img src={p.src} alt={p.caption || 'Ảnh album'} loading="lazy" />
                {p.cover && (
                  <span className="album-item__cover">
                    <Icon name="star" size={11} /> Bìa
                  </span>
                )}
                <input
                  className="album-item__check"
                  type="checkbox"
                  checked={albumSelected.has(p.id)}
                  onChange={(e) => {
                    setAlbumSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    });
                  }}
                  aria-label="Chọn ảnh để xoá hàng loạt"
                />
                <input
                  className="album-item__caption"
                  value={p.caption || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    mutateDraft((d) => {
                      const photo = d.album.photos.find((x) => x.id === p.id);
                      if (photo) photo.caption = value;
                    });
                  }}
                  placeholder="Nhập caption cho ảnh…"
                />
                <div className="album-item__row">
                  <button
                    className="btn btn--sm"
                    type="button"
                    disabled={!!p.cover}
                    onClick={() => {
                      mutateDraft((d) => {
                        d.album.photos.forEach((x) => {
                          x.cover = x.id === p.id;
                        });
                      });
                      toast('Đã đặt ảnh bìa ✓');
                    }}
                  >
                    Đặt làm bìa
                  </button>
                  <button
                    className="btn btn--danger btn--sm"
                    type="button"
                    onClick={() => {
                      mutateDraft((d) => {
                        d.album.photos = d.album.photos.filter((x) => x.id !== p.id);
                        if (!d.album.photos.some((x) => x.cover) && d.album.photos.length) d.album.photos[0].cover = true;
                      });
                      setAlbumSelected((prev) => {
                        const next = new Set(prev);
                        next.delete(p.id);
                        return next;
                      });
                    }}
                  >
                    Xoá
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {photos.length === 0 && <p className="form__hint">Album chưa có ảnh nào.</p>}
        </div>
      </section>
    );
  }

  // ==================================================================
  // 6. SỰ KIỆN CƯỚI
  // ==================================================================
  function openEventModal(item) {
    setEventModal({
      id: item ? item.id : '',
      name: item ? item.name : '',
      date: item ? item.date : '',
      time: item ? item.time : '',
      venue: item ? item.venue : '',
      address: item ? item.address : '',
      mapsUrl: item ? item.mapsUrl : '',
      image: item ? item.image : '',
      note: item ? item.note : '',
      mapsError: false,
    });
  }

  function submitEventModal(e) {
    e.preventDefault();
    if (!eventModal) return;
    const name = eventModal.name.trim();
    const date = eventModal.date;
    if (!name) {
      toast('Tên sự kiện là bắt buộc.', 'error');
      return;
    }
    if (!date || Number.isNaN(new Date(date).getTime())) {
      toast('Ngày sự kiện chưa hợp lệ.', 'error');
      return;
    }
    const mapsUrl = (eventModal.mapsUrl || '').trim();
    if (mapsUrl && !isValidUrl(mapsUrl)) {
      setEventModal((prev) => (prev ? { ...prev, mapsError: true } : prev));
      toast('Link Google Maps chưa đúng định dạng URL.', 'error');
      return;
    }
    const data = {
      name,
      date,
      time: eventModal.time,
      venue: eventModal.venue.trim(),
      address: eventModal.address.trim(),
      mapsUrl,
      image: (eventModal.image || '').trim(),
      note: eventModal.note.trim(),
    };
    mutateDraft((d) => {
      d.events.items = d.events.items || [];
      if (eventModal.id) {
        const item = d.events.items.find((x) => x.id === eventModal.id);
        if (item) Object.assign(item, data);
      } else {
        d.events.items.push({ id: uid('event'), ...data });
      }
    });
    setEventModal(null);
    toast('Đã lưu sự kiện ✓');
  }

  function renderEvents() {
    const items = draft.events.items || [];
    return (
      <section className="screen is-active" id="screen-events" data-title="Sự kiện cưới">
        <div className="screen__head">
          <h1 className="screen__title">Sự kiện cưới</h1>
          <p className="screen__desc">Lễ ăn hỏi, lễ cưới, tiệc chiêu đãi… — thêm, sửa, kéo thả sắp xếp.</p>
        </div>
        <div className="card">
          <Switch
            label="Hiển thị section Sự kiện cưới"
            checked={draft.events.enabled}
            onChange={(v) => updateDraft('events.enabled', v)}
            ariaLabel="Bật section sự kiện"
          />
          <div style={{ marginTop: 14 }}>
            <Field label="Tiêu đề section">
              <input
                className="form__input"
                value={draft.events.title || ''}
                onChange={(e) => updateDraft('events.title', e.target.value)}
              />
            </Field>
            <Field label="Câu trích dẫn đầu section">
              <textarea
                className="form__textarea"
                value={draft.events.quote || ''}
                onChange={(e) => updateDraft('events.quote', e.target.value)}
              />
            </Field>
          </div>
          <Switch
            label="Hiển thị nút “Thêm vào lịch”"
            checked={draft.events.showAddToCalendar}
            onChange={(v) => updateDraft('events.showAddToCalendar', v)}
            ariaLabel="Bật nút thêm vào lịch"
          />
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 className="card__title" style={{ margin: 0 }}>
              Danh sách sự kiện
            </h2>
            <button className="btn btn--primary btn--sm" type="button" onClick={() => openEventModal(null)}>
              <Icon name="plus" size={14} /> Thêm sự kiện
            </button>
          </div>
          <ul className="sort-list" style={{ marginTop: 14 }}>
            {items.map((it) => (
              <li
                key={it.id}
                className="sort-item"
                draggable
                onDragStart={drag.onDragStart(it.id)}
                onDragOver={drag.onDragOver}
                onDrop={drag.onDrop(it.id, (from, to) => {
                  mutateDraft((d) => {
                    d.events.items = moveBefore(d.events.items, from, to);
                  });
                })}
                onDragEnd={drag.onDragEnd}
              >
                <span className="sort-item__handle" title="Kéo để sắp xếp">
                  <Icon name="move" size={16} />
                </span>
                {it.image && <img className="sort-item__thumb" src={it.image} alt="" />}
                <div className="sort-item__body">
                  <div className="sort-item__title">{it.name || '(Chưa đặt tên)'}</div>
                  <div className="sort-item__meta">
                    {fmtDateShort(it.date)}
                    {it.time ? ` • ${it.time}` : ''}
                    {it.venue ? ` • ${it.venue}` : ''}
                  </div>
                </div>
                <div className="sort-item__actions">
                  <button className="btn btn--sm" type="button" onClick={() => openEventModal(it)}>
                    Sửa
                  </button>
                  <button
                    className="btn btn--danger btn--sm"
                    type="button"
                    onClick={() => {
                      if (!window.confirm('Xoá sự kiện này?')) return;
                      mutateDraft((d) => {
                        d.events.items = d.events.items.filter((x) => x.id !== it.id);
                      });
                    }}
                  >
                    Xoá
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {items.length === 0 && <p className="form__hint">Chưa có sự kiện nào.</p>}
        </div>
      </section>
    );
  }

  function renderEventModal() {
    if (!eventModal) return null;
    const set = (patch) => setEventModal((prev) => (prev ? { ...prev, ...patch } : prev));
    return (
      <Modal
        open
        title={eventModal.id ? 'Sửa sự kiện' : 'Thêm sự kiện'}
        onClose={() => setEventModal(null)}
      >
        <form
          noValidate
          onSubmit={submitEventModal}
        >
          <Field label="Tên sự kiện" required>
            <input
              className="form__input"
              value={eventModal.name}
              onChange={(e) => set({ name: e.target.value })}
              required
              placeholder="Ví dụ: Lễ Cưới & Tiệc Chiêu Đãi"
              autoFocus
            />
          </Field>
          <div className="form__row form__row--2">
            <Field label="Ngày" required>
              <input
                className="form__input"
                type="date"
                value={eventModal.date}
                onChange={(e) => set({ date: e.target.value })}
                required
              />
            </Field>
            <Field label="Giờ">
              <input
                className="form__input"
                type="time"
                value={eventModal.time}
                onChange={(e) => set({ time: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Tên địa điểm">
            <input
              className="form__input"
              value={eventModal.venue}
              onChange={(e) => set({ venue: e.target.value })}
              placeholder="Ví dụ: Trung tâm tiệc cưới Hạnh Phúc"
            />
          </Field>
          <Field label="Địa chỉ">
            <input
              className="form__input"
              value={eventModal.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="Số nhà, đường, quận, thành phố"
            />
          </Field>
          <Field label="Link Google Maps" error={eventModal.mapsError ? 'Link Google Maps chưa đúng định dạng URL.' : ''}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form__input"
                type="url"
                value={eventModal.mapsUrl}
                onChange={(e) => set({ mapsUrl: e.target.value, mapsError: false })}
                placeholder="https://www.google.com/maps/…"
              />
              <button
                className="btn btn--sm"
                type="button"
                onClick={() => {
                  const url = (eventModal.mapsUrl || '').trim();
                  if (!url) {
                    toast('Chưa có link Google Maps.', 'error');
                    return;
                  }
                  if (!isValidUrl(url)) {
                    set({ mapsError: true });
                    toast('Link chưa đúng định dạng URL.', 'error');
                    return;
                  }
                  window.open(url, '_blank', 'noopener');
                }}
              >
                Thử mở <Icon name="external" size={13} />
              </button>
            </div>
          </Field>
          <Field label="Ảnh minh hoạ (URL hoặc upload)">
            <input
              className="form__input"
              type="url"
              value={eventModal.image}
              onChange={(e) => set({ image: e.target.value })}
              placeholder="https://…/anh.jpg"
            />
            <div style={{ marginTop: 8 }}>
              <label className="btn btn--sm" htmlFor="eventImageFile">
                <Icon name="upload" size={14} /> Chọn &amp; chỉnh ảnh</label>
              <><input
                type="file"
                id="eventImageFile"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files[0];
                  e.target.value = '';
                  if (!f) return;
                  const dataUrl = await uploadImage(f);
                  if (dataUrl) set({ image: dataUrl });
                }}
              /></>
            </div>
          </Field>
          <Field label="Ghi chú">
            <textarea
              className="form__textarea"
              value={eventModal.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="Ví dụ: Đón khách từ 08:30…"
            />
          </Field>
          <div className="modal__actions">
            <button className="btn" type="button" onClick={() => setEventModal(null)}>
              Huỷ
            </button>
            <button className="btn btn--primary" type="submit">
              Lưu sự kiện
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  // ==================================================================
  // 7. VIDEO
  // ==================================================================
  function renderVideo() {
    const hasUrl = !!String(draft.video.youtubeUrl || '').trim();
    return (
      <section className="screen is-active" id="screen-video" data-title="Video">
        <div className="screen__head">
          <h1 className="screen__title">Video cưới</h1>
          <p className="screen__desc">Dán link YouTube — hệ thống tự tách ID và xem trước ngay tại đây.</p>
        </div>
        <div className="card">
          <Switch
            label="Hiển thị section Video trên thiệp"
            checked={draft.video.enabled}
            onChange={(v) => updateDraft('video.enabled', v)}
            ariaLabel="Bật section video"
          />
          <div style={{ marginTop: 14 }}>
            <Field label="Tiêu đề section">
              <input
                className="form__input"
                value={draft.video.title || ''}
                onChange={(e) => updateDraft('video.title', e.target.value)}
              />
            </Field>
            <Field
              label="Link YouTube"
              hint="Hỗ trợ cả 3 dạng: watch, youtu.be và embed. Để trống nếu chưa có video."
              error={hasUrl && !videoId ? 'Link YouTube chưa đúng định dạng.' : ''}
            >
              <input
                className={`form__input${invalid('video.youtubeUrl')}`}
                type="url"
                value={draft.video.youtubeUrl || ''}
                onChange={(e) => updateDraft('video.youtubeUrl', e.target.value)}
                placeholder="https://www.youtube.com/watch?v=… hoặc https://youtu.be/… hoặc link embed"
              />
            </Field>
          </div>
          {videoId ? (
            <div>
              <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
                <iframe
                  title="Xem trước video cưới"
                  src={`https://www.youtube.com/embed/${videoId}`}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                  allowFullScreen
                />
              </div>
              <p className="form__hint">Video ID: {videoId}</p>
            </div>
          ) : (
            <p className="form__hint">Chưa có link video — dán link YouTube ở trên để xem trước.</p>
          )}
        </div>
      </section>
    );
  }

  // ==================================================================
  // 8. NHẠC NỀN
  // ==================================================================
  function handleMusicFile(file) {
    const MAX_MP3 = 5 * 1024 * 1024;
    if (!file) return;
    if (file.size > MAX_MP3) {
      toast(`File mp3 ${(file.size / 1024 / 1024).toFixed(1)}MB vượt giới hạn 5MB. Hãy nén file hoặc dán URL nhạc thay vì upload.`, 'error');
      return;
    }
    if (!checkStorageBeforeAdd(file.size * 1.4)) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateDraft('music.url', String(reader.result));
      toast('Đã tải lên file nhạc ✓ (nghe thử bên dưới)');
    };
    reader.onerror = () => toast('Không đọc được file nhạc.', 'error');
    reader.readAsDataURL(file);
  }

  function renderMusic() {
    const volumePct = Math.round((draft.music.volume ?? 0.5) * 100);
    return (
      <section className="screen is-active" id="screen-music" data-title="Nhạc nền">
        <div className="screen__head">
          <h1 className="screen__title">Nhạc nền</h1>
          <p className="screen__desc">Nhạc phát khi khách mở thiệp. File mp3 tối đa 5MB.</p>
        </div>
        <div className="card">
          <Switch
            label="Bật nhạc nền"
            checked={draft.music.enabled}
            onChange={(v) => updateDraft('music.enabled', v)}
            ariaLabel="Bật nhạc nền"
          />
          <Switch
            label="Hiển thị nút bật/tắt nhạc trên thiệp"
            checked={draft.music.showButton}
            onChange={(v) => updateDraft('music.showButton', v)}
            ariaLabel="Hiển thị nút nhạc"
          />
          <div style={{ marginTop: 14 }}>
            <Field
              label="URL file nhạc (mp3)"
              hint="Hoặc upload file mp3 bên dưới (tối đa 5MB — file lớn hơn sẽ không lưu được). Được phép dùng đường dẫn tương đối, ví dụ assets/beautiful-in-white.mp3."
            >
              <input
                className="form__input"
                type="url"
                value={draft.music.url || ''}
                onChange={(e) => updateDraft('music.url', e.target.value)}
                placeholder="https://…/nhac.mp3"
              />
            </Field>
          </div>
          <div className="card__actions">
            <label className="btn" htmlFor="musicFileInput">
              <Icon name="upload" size={15} /> Upload file mp3 (≤ 5MB)
            </label>
            <input
              type="file"
              id="musicFileInput"
              accept="audio/mpeg,audio/mp3,.mp3"
              hidden
              onChange={(e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (f) handleMusicFile(f);
              }}
            />
            <button
              className="btn btn--danger btn--sm"
              type="button"
              onClick={() => updateDraft('music.url', '')}
            >
              Xoá nhạc
            </button>
          </div>
          <div style={{ marginTop: 16 }}>
            <Field label={`Âm lượng mặc định: ${volumePct}%`} hint="Âm lượng lưu trong config theo thang 0–1 (50% = 0.5).">
              <input
                className="form__input"
                type="range"
                min="0"
                max="100"
                step="1"
                value={String(volumePct)}
                onChange={(e) => {
                  const pct = Math.round(Number(e.target.value));
                  updateDraft('music.volume', pct / 100);
                  if (audioRef.current) audioRef.current.volume = pct / 100;
                }}
              />
            </Field>
          </div>
          {musicUrl ? (
            <div style={{ marginTop: 8 }}>
              <p className="form__label">Nghe thử</p>
              <audio ref={audioRef} controls preload="none" style={{ width: '100%' }} src={musicUrl} />
            </div>
          ) : (
            <p className="form__hint">Chưa có nhạc — dán URL hoặc upload file mp3 để nghe thử.</p>
          )}
        </div>
      </section>
    );
  }

  // ==================================================================
  // 9. GIAO DIỆN
  // ==================================================================
  function renderTheme() {
    const theme = draft.theme;
    const heading = theme.fonts.heading || 'Playfair Display';
    const accent = theme.fonts.accent || 'Great Vibes';
    const body = theme.fonts.body || 'Be Vietnam Pro';
    return (
      <section className="screen is-active" id="screen-theme" data-title="Giao diện">
        <div className="screen__head">
          <h1 className="screen__title">Giao diện</h1>
          <p className="screen__desc">Màu sắc, font chữ, hiệu ứng và thứ tự các section trên thiệp.</p>
        </div>
        <div className="card">
          <h2 className="card__title">Preset màu</h2>
          <p className="card__subtitle">Bấm một preset để đặt đủ 4 màu cùng lúc.</p>
          <div className="preset-grid">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`preset${theme.preset === p.id ? ' is-active' : ''}`}
                type="button"
                onClick={() => {
                  mutateDraft((d) => {
                    d.theme.preset = p.id;
                    d.theme.colors = { ...p.colors };
                  });
                  toast(`Đã áp preset màu “${p.name}” ✓`);
                }}
              >
                <span className="preset__swatches">
                  {Object.values(p.colors).map((c) => (
                    <span key={c} className="preset__swatch" style={{ background: c }} />
                  ))}
                </span>
                <span className="preset__name">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="card__title">Màu tuỳ chỉnh</h2>
          <div className="color-row">
            <Field label="Màu chính">
              <input
                className="form__input"
                type="color"
                value={theme.colors.primary || '#b76e79'}
                onChange={(e) => updateDraft('theme.colors.primary', e.target.value)}
              />
            </Field>
            <Field label="Màu phụ">
              <input
                className="form__input"
                type="color"
                value={theme.colors.secondary || '#8a6d5c'}
                onChange={(e) => updateDraft('theme.colors.secondary', e.target.value)}
              />
            </Field>
            <Field label="Màu nền">
              <input
                className="form__input"
                type="color"
                value={theme.colors.background || '#fdf8f5'}
                onChange={(e) => updateDraft('theme.colors.background', e.target.value)}
              />
            </Field>
            <Field label="Màu chữ">
              <input
                className="form__input"
                type="color"
                value={theme.colors.text || '#4a3f3a'}
                onChange={(e) => updateDraft('theme.colors.text', e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="card">
          <h2 className="card__title">Font chữ (Google Fonts, hỗ trợ tiếng Việt)</h2>
          <div className="form__row form__row--2">
            <Field label="Font tiêu đề">
              <select
                className="form__select"
                value={theme.fonts.heading}
                onChange={(e) => updateDraft('theme.fonts.heading', e.target.value)}
              >
                <option>Playfair Display</option>
                <option>Noto Serif</option>
                <option>Be Vietnam Pro</option>
                <option>Inter</option>
              </select>
            </Field>
            <Field label="Font viết tay (tên cô dâu chú rể)">
              <select
                className="form__select"
                value={theme.fonts.accent}
                onChange={(e) => updateDraft('theme.fonts.accent', e.target.value)}
              >
                <option>Great Vibes</option>
                <option>Dancing Script</option>
                <option>Playfair Display</option>
              </select>
            </Field>
            <Field label="Font nội dung">
              <select
                className="form__select"
                value={theme.fonts.body}
                onChange={(e) => updateDraft('theme.fonts.body', e.target.value)}
              >
                <option>Be Vietnam Pro</option>
                <option>Inter</option>
                <option>Noto Serif</option>
                <option>Playfair Display</option>
              </select>
            </Field>
          </div>
          <div className="font-sample" style={{ fontFamily: `'${body}', sans-serif` }}>
            <div
              className="font-sample__names"
              style={{ fontFamily: `'${accent}', cursive`, color: theme.colors.primary || '#b76e79' }}
            >
              {(draft.couple.groom.name || 'Tên Chú Rể') + ' & ' + (draft.couple.bride.name || 'Tên Cô Dâu')}
            </div>
            <div className="font-sample__body" style={{ fontFamily: `'${body}', sans-serif` }}>
              Trân trọng kính mời bạn đến dự lễ cưới của chúng mình — tiêu đề dùng font {heading}.
            </div>
          </div>
        </div>
        <div className="card">
          <h2 className="card__title">Hiệu ứng &amp; màn hình chờ</h2>
          <Field label="Hiệu ứng rơi">
            <select
              className="form__select"
              value={theme.effect}
              onChange={(e) => updateDraft('theme.effect', e.target.value)}
            >
              <option value="petals">Cánh hoa</option>
              <option value="hearts">Trái tim</option>
              <option value="none">Không có</option>
            </select>
          </Field>
          <Field label="Tốc độ hiệu ứng cuộn">
            <select
              className="form__select"
              value={theme.scrollSpeed}
              onChange={(e) => updateDraft('theme.scrollSpeed', e.target.value)}
            >
              <option value="slow">Chậm</option>
              <option value="normal">Vừa</option>
              <option value="fast">Nhanh</option>
            </select>
          </Field>
          <Switch
            label="Hiển thị màn hình loading khi mở thiệp"
            checked={theme.showLoading}
            onChange={(v) => updateDraft('theme.showLoading', v)}
            ariaLabel="Bật màn hình loading"
          />
        </div>
        <div className="card">
          <h2 className="card__title">Thứ tự &amp; hiển thị các section</h2>
          <p className="card__subtitle">Kéo thả để đổi thứ tự trên thiệp, bật/tắt từng section, sửa label trên thanh điều hướng.</p>
          <ul className="sort-list">
            {(draft.sections || []).map((s) => (
              <li
                key={s.id}
                className="sort-item"
                draggable
                onDragStart={drag.onDragStart(s.id)}
                onDragOver={drag.onDragOver}
                onDrop={drag.onDrop(s.id, (from, to) => {
                  mutateDraft((d) => {
                    d.sections = moveBefore(d.sections, from, to);
                  });
                })}
                onDragEnd={drag.onDragEnd}
              >
                <span className="sort-item__handle" title="Kéo để sắp xếp">
                  <Icon name="move" size={16} />
                </span>
                <div className="sort-item__body">
                  <div className="sort-item__title">{s.label || s.id}</div>
                  <div className="sort-item__meta">ID: {s.id}</div>
                </div>
                <input
                  className="form__input"
                  style={{ maxWidth: 180 }}
                  value={s.label || ''}
                  onChange={(e) => updateDraft(`sections`, draft.sections.map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x)))}
                  aria-label={`Label navbar của ${s.id}`}
                />
                <label style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={!!s.enabled}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      mutateDraft((d) => {
                        const sec = d.sections.find((x) => x.id === s.id);
                        if (sec) sec.enabled = checked;
                      });
                    }}
                  />{' '}
                  Hiển thị
                </label>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  // ==================================================================
  // 10. SỔ LƯU BÚT
  // ==================================================================
  async function handleWishAction(action, id) {
    if (action === 'approve') {
      const r = await approveWish(id);
      if (!r.ok) toast(r.error || 'Không duyệt được.', 'error');
      else {
        await refreshLists();
        toast('Đã duyệt lời chúc ✓');
      }
    } else if (action === 'hide') {
      const r = await hideWish(id);
      if (!r.ok) toast(r.error || 'Không ẩn được.', 'error');
      else {
        await refreshLists();
        toast('Đã ẩn lời chúc ✓');
      }
    } else if (action === 'delete') {
      if (!window.confirm('Xoá lời chúc này?')) return;
      const r = await deleteWish(id);
      if (!r.ok) toast(r.error || 'Không xoá được.', 'error');
      else {
        setWishState((prev) => {
          const selected = new Set(prev.selected);
          selected.delete(id);
          return { ...prev, selected };
        });
        await refreshLists();
        toast('Đã xoá lời chúc ✓');
      }
    }
  }

  async function handleDeleteSelectedWishes() {
    if (!wishState.selected.size) return;
    if (!window.confirm(`Xoá ${wishState.selected.size} lời chúc đã chọn?`)) return;
    const results = await Promise.all(Array.from(wishState.selected, (id) => deleteWish(id)));
    const failed = results.filter((r) => !r.ok).length;
    setWishState((prev) => ({ ...prev, selected: new Set() }));
    await refreshLists();
    toast(failed ? `Đã xoá, nhưng ${failed} mục lỗi.` : 'Đã xoá các lời chúc đã chọn ✓', failed ? 'error' : 'success');
  }

  async function submitWishModal(e) {
    e.preventDefault();
    const name = wishForm.name.trim();
    const message = wishForm.message.trim();
    const email = wishForm.email.trim();
    if (!name) {
      toast('Tên người chúc là bắt buộc.', 'error');
      return;
    }
    if (!message) {
      toast('Lời chúc là bắt buộc.', 'error');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('Email chưa đúng định dạng.', 'error');
      return;
    }
    // Lời chúc thêm thủ công mặc định đã duyệt (do chính admin nhập hộ).
    const r = await addWish({ name, email, message, approved: true });
    if (!r.ok) {
      toast(r.error || 'Không thêm được lời chúc.', 'error');
      return;
    }
    setWishModalOpen(false);
    setWishForm({ name: '', email: '', message: '' });
    await refreshLists();
    toast('Đã thêm lời chúc ✓');
  }

  function submitTextModal(e) {
    e.preventDefault();
    if (!textModal) return;
    const value = (textModal.value || '').trim();
    if (!value) {
      setTextModal(null);
      return;
    }
    mutateDraft((d) => {
      d.guestbook.suggestions = d.guestbook.suggestions || [];
      if (textModal.mode === 'edit') d.guestbook.suggestions[textModal.index] = value;
      else d.guestbook.suggestions.push(value);
    });
    setTextModal(null);
    toast(textModal.mode === 'edit' ? 'Đã sửa lời chúc gợi ý ✓' : 'Đã thêm lời chúc gợi ý ✓');
  }

  function renderGuestbook() {
    const suggestions = draft.guestbook.suggestions || [];
    const moveSuggestion = (from, to) => {
      const fromIdx = Number(String(from).split(':')[1]);
      const toIdx = Number(String(to).split(':')[1]);
      if (Number.isNaN(fromIdx) || Number.isNaN(toIdx) || fromIdx === toIdx) return;
      mutateDraft((d) => {
        const list = [...(d.guestbook.suggestions || [])];
        const [item] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, item);
        d.guestbook.suggestions = list;
      });
    };
    return (
      <section className="screen is-active" id="screen-guestbook" data-title="Sổ lưu bút">
        <div className="screen__head">
          <h1 className="screen__title">Sổ lưu bút</h1>
          <p className="screen__desc">Duyệt, ẩn, xoá lời chúc và cấu hình sổ lưu bút trên thiệp.</p>
        </div>
        <div className="card">
          <div className="table-toolbar">
            <input
              className="form__input"
              type="search"
              placeholder="Tìm theo tên, email hoặc nội dung…"
              value={wishState.search}
              onChange={(e) => setWishState((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
            />
            <select
              className="form__select"
              value={wishState.filter}
              onChange={(e) => setWishState((prev) => ({ ...prev, filter: e.target.value, page: 1 }))}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="approved">Đã duyệt</option>
              <option value="pending">Chờ duyệt</option>
            </select>
          </div>
          <div className="card__actions" style={{ margin: '0 0 12px' }}>
            <button
              className="btn btn--sm"
              type="button"
              onClick={() => {
                setWishForm({ name: '', email: '', message: '' });
                setWishModalOpen(true);
              }}
            >
              <Icon name="plus" size={14} /> Thêm lời chúc thủ công
            </button>
            <button
              className="btn btn--sm"
              type="button"
              onClick={() => {
                downloadCSV(
                  'loi-chuc.csv',
                  ['Tên', 'Email', 'Lời chúc', 'Thời gian', 'Đã duyệt'],
                  wishes.map((w) => [w.name, w.email || '', w.message, w.createdAt, w.approved ? 'Có' : 'Không']),
                );
                toast('Đã xuất CSV lời chúc ✓');
              }}
            >
              <Icon name="download" size={14} /> Xuất CSV
            </button>
            <button
              className="btn btn--danger btn--sm"
              type="button"
              disabled={wishState.selected.size === 0}
              onClick={handleDeleteSelectedWishes}
            >
              <Icon name="trash" size={14} /> Xoá đã chọn (<span>{wishState.selected.size}</span>)
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={wishPageItems.length > 0 && wishPageItems.every((w) => wishState.selected.has(w.id))}
                      onChange={(e) => {
                        const pageIds = wishPageItems.map((w) => w.id);
                        setWishState((prev) => {
                          const selected = new Set(prev.selected);
                          if (e.target.checked) pageIds.forEach((id) => selected.add(id));
                          else pageIds.forEach((id) => selected.delete(id));
                          return { ...prev, selected };
                        });
                      }}
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th>Tên</th>
                  <th>Nội dung</th>
                  <th>Thời gian</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {wishPageItems.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--admin-text-2)' }}>
                      Chưa có lời chúc nào.
                    </td>
                  </tr>
                )}
                {wishPageItems.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={wishState.selected.has(w.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setWishState((prev) => {
                            const selected = new Set(prev.selected);
                            if (checked) selected.add(w.id);
                            else selected.delete(w.id);
                            return { ...prev, selected };
                          });
                        }}
                        aria-label="Chọn lời chúc"
                      />
                    </td>
                    <td>
                      <strong>{w.name}</strong>
                      {w.email && (
                        <>
                          <br />
                          <span style={{ fontSize: 12, color: 'var(--admin-text-2)' }}>{w.email}</span>
                        </>
                      )}
                    </td>
                    <td className="table__msg">{w.message}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(w.createdAt)}</td>
                    <td>
                      {w.approved ? (
                        <span className="badge badge--yes">Đã duyệt</span>
                      ) : (
                        <span className="badge badge--maybe">Chờ duyệt</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {w.approved ? (
                        <button className="btn btn--sm" type="button" onClick={() => handleWishAction('hide', w.id)}>
                          Ẩn
                        </button>
                      ) : (
                        <button className="btn btn--sm" type="button" onClick={() => handleWishAction('approve', w.id)}>
                          Duyệt
                        </button>
                      )}{' '}
                      <button className="btn btn--danger btn--sm" type="button" onClick={() => handleWishAction('delete', w.id)}>
                        Xoá
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={wishPage} pageSize={wishState.perPage} total={filteredWishesList.length} label="lời chúc" onPageChange={(page) => setWishState((prev) => ({ ...prev, page }))} />
        </div>
        <div className="card">
          <h2 className="card__title">Cấu hình sổ lưu bút</h2>
          <Switch
            label="Hiển thị sổ lưu bút trên thiệp"
            checked={draft.guestbook.enabled}
            onChange={(v) => updateDraft('guestbook.enabled', v)}
            ariaLabel="Bật sổ lưu bút"
          />
          <p className="form__hint">Lời chúc mới tự động hiển thị sau khi qua bộ lọc từ ngữ. Bạn vẫn có thể ẩn hoặc xoá lời chúc tại đây.</p>
          <div style={{ marginTop: 14 }}>
            <Field label="Tiêu đề sổ lưu bút">
              <input
                className="form__input"
                value={draft.guestbook.title || ''}
                onChange={(e) => updateDraft('guestbook.title', e.target.value)}
              />
            </Field>
            <Field label="Phụ đề">
              <input
                className="form__input"
                value={draft.guestbook.subtitle || ''}
                onChange={(e) => updateDraft('guestbook.subtitle', e.target.value)}
              />
            </Field>
            <Field label="Lời cảm ơn sau khi khách gửi chúc">
              <textarea
                className="form__textarea"
                value={draft.guestbook.thankYou || ''}
                onChange={(e) => updateDraft('guestbook.thankYou', e.target.value)}
              />
            </Field>
          </div>
          <h3 style={{ fontSize: 14.5, margin: '14px 0 8px' }}>Lời chúc gợi ý (kéo thả để sắp xếp)</h3>
          <ul className="sort-list">
            {suggestions.map((s, i) => (
              <li
                key={`${s}-${i}`}
                className="sort-item"
                draggable
                onDragStart={drag.onDragStart(`sugg:${i}`)}
                onDragOver={drag.onDragOver}
                onDrop={drag.onDrop(`sugg:${i}`, moveSuggestion)}
                onDragEnd={drag.onDragEnd}
              >
                <span className="sort-item__handle" title="Kéo để sắp xếp">
                  <Icon name="move" size={16} />
                </span>
                <div className="sort-item__body">
                  <div className="sort-item__title" style={{ fontWeight: 500 }}>
                    {s}
                  </div>
                </div>
                <div className="sort-item__actions">
                  <button
                    className="btn btn--sm"
                    type="button"
                    onClick={() => setTextModal({ title: 'Sửa lời chúc gợi ý', value: s, mode: 'edit', index: i })}
                  >
                    Sửa
                  </button>
                  <button
                    className="btn btn--danger btn--sm"
                    type="button"
                    onClick={() => {
                      mutateDraft((d) => {
                        d.guestbook.suggestions.splice(i, 1);
                      });
                    }}
                  >
                    Xoá
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            className="btn btn--sm"
            type="button"
            onClick={() => setTextModal({ title: 'Thêm lời chúc gợi ý', value: '', mode: 'add', index: -1 })}
          >
            <Icon name="plus" size={14} /> Thêm lời chúc gợi ý
          </button>
        </div>
      </section>
    );
  }

  function renderWishModal() {
    return (
      <Modal open={wishModalOpen} title="Thêm lời chúc thủ công" onClose={() => setWishModalOpen(false)}>
        <form noValidate onSubmit={submitWishModal}>
          <Field label="Tên người chúc" required>
            <input
              className="form__input"
              value={wishForm.name}
              onChange={(e) => setWishForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              placeholder="Ví dụ: Gia đình nhà trai"
              autoFocus
            />
          </Field>
          <Field label="Email (không bắt buộc)">
            <input
              className="form__input"
              type="email"
              value={wishForm.email}
              onChange={(e) => setWishForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="vi-du@email.com"
            />
          </Field>
          <Field label="Lời chúc" required>
            <textarea
              className="form__textarea"
              value={wishForm.message}
              onChange={(e) => setWishForm((prev) => ({ ...prev, message: e.target.value }))}
              required
              placeholder="Nhập lời chúc hộ khách…"
            />
          </Field>
          <div className="modal__actions">
            <button className="btn" type="button" onClick={() => setWishModalOpen(false)}>
              Huỷ
            </button>
            <button className="btn btn--primary" type="submit">
              Thêm lời chúc
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  function renderTextModal() {
    if (!textModal) return null;
    return (
      <Modal open title={textModal.title} onClose={() => setTextModal(null)}>
        <form noValidate onSubmit={submitTextModal}>
          <Field label="Nội dung">
            <textarea
              className="form__textarea"
              value={textModal.value}
              onChange={(e) => setTextModal((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
              required
              autoFocus
            />
          </Field>
          <div className="modal__actions">
            <button className="btn" type="button" onClick={() => setTextModal(null)}>
              Huỷ
            </button>
            <button className="btn btn--primary" type="submit">
              Lưu
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  // ==================================================================
  // 11. RSVP / KHÁCH MỜI
  // ==================================================================
  function renderRsvp() {
    return (
      <section className="screen is-active" id="screen-rsvp" data-title="RSVP / Khách mời">
        <div className="screen__head">
          <h1 className="screen__title">RSVP / Khách mời</h1>
          <p className="screen__desc">Danh sách xác nhận tham dự và cấu hình form RSVP trên thiệp.</p>
        </div>
        <div className="card">
          <div className="stat__value" style={{ fontSize: 24 }}>
            {rsvps.length} RSVP • {rsvpYes.length} xác nhận “Có” • {guestsTotal} khách dự kiến
          </div>
          <p className="form__hint">Tổng số khách dự kiến = tổng trường “số người” của các RSVP trạng thái “Có”.</p>
        </div>
        <div className="card">
          <div className="table-toolbar">
            <input
              className="form__input"
              type="search"
              placeholder="Tìm theo tên, SĐT hoặc lời nhắn…"
              value={rsvpState.search}
              onChange={(e) => setRsvpState((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
            />
            <select
              className="form__select"
              value={rsvpState.status}
              onChange={(e) => setRsvpState((prev) => ({ ...prev, status: e.target.value, page: 1 }))}
            >
              <option value="all">Mọi trạng thái</option>
              <option value="yes">Có tham dự</option>
              <option value="no">Không tham dự</option>
              <option value="maybe">Chưa chắc</option>
            </select>
            <select
              className="form__select"
              value={rsvpState.side}
              onChange={(e) => setRsvpState((prev) => ({ ...prev, side: e.target.value, page: 1 }))}
            >
              <option value="all">Cả hai bên</option>
              <option value="trai">Nhà trai</option>
              <option value="gai">Nhà gái</option>
            </select>
          </div>
          <div className="card__actions" style={{ margin: '0 0 12px' }}>
            <button
              className="btn btn--sm"
              type="button"
              onClick={() => {
                downloadCSV(
                  'rsvp-khach-moi.csv',
                  ['Tên', 'SĐT', 'Email', 'Số người', 'Bên', 'Tham dự lễ', 'Trạng thái', 'Lời nhắn', 'Thời gian'],
                  rsvps.map((r) => [
                    r.name,
                    r.phone || '',
                    r.email || '',
                    r.guests,
                    r.side || '',
                    r.ceremonies || '',
                    RSVP_STATUS_LABEL[r.status] || r.status,
                    r.message || '',
                    r.createdAt,
                  ]),
                );
                toast('Đã xuất CSV RSVP ✓');
              }}
            >
              <Icon name="download" size={14} /> Xuất CSV
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>SĐT</th>
                  <th>Số người</th>
                  <th>Tham dự lễ</th>
                  <th>Bên</th>
                  <th>Trạng thái</th>
                  <th>Lời nhắn</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {rsvpPageItems.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', color: 'var(--admin-text-2)' }}>
                      Không có khách mời nào khớp điều kiện.
                    </td>
                  </tr>
                )}
                {rsvpPageItems.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      {r.email && (
                        <>
                          <br />
                          <span style={{ fontSize: 12, color: 'var(--admin-text-2)' }}>{r.email}</span>
                        </>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                    <td>{String(r.guests ?? 1)}</td>
                    <td>{r.ceremonies || '—'}</td>
                    <td>{r.side || '—'}</td>
                    <td>
                      <select
                        className="form__select"
                        style={{ minWidth: 110 }}
                        value={r.status}
                        onChange={async (e) => {
                          const res = await updateRsvpStatus(r.id, e.target.value);
                          if (!res.ok) {
                            toast(res.error || 'Không đổi được trạng thái.', 'error');
                            return;
                          }
                          await refreshLists();
                          toast('Đã đổi trạng thái RSVP ✓');
                        }}
                      >
                        {['yes', 'no', 'maybe'].map((s) => (
                          <option key={s} value={s}>
                            {RSVP_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="table__msg">{r.message || '—'}</td>
                    <td>
                      <button
                        className="btn btn--danger btn--sm"
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('Xoá RSVP này?')) return;
                          const res = await deleteRsvp(r.id);
                          if (!res.ok) toast(res.error || 'Không xoá được.', 'error');
                          else {
                            await refreshLists();
                            toast('Đã xoá RSVP ✓');
                          }
                        }}
                      >
                        Xoá
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={rsvpPage} pageSize={rsvpState.perPage} total={filteredRsvpsList.length} label="khách" onPageChange={(page) => setRsvpState((prev) => ({ ...prev, page }))} />
        </div>
        <div className="card">
          <h2 className="card__title">Cấu hình form RSVP</h2>
          <Switch
            label="Hiển thị form RSVP trên thiệp"
            checked={draft.rsvp.enabled}
            onChange={(v) => updateDraft('rsvp.enabled', v)}
            ariaLabel="Bật form RSVP"
          />
          <div style={{ marginTop: 14 }}>
            <Field label="Tiêu đề form">
              <input
                className="form__input"
                value={draft.rsvp.title || ''}
                onChange={(e) => updateDraft('rsvp.title', e.target.value)}
              />
            </Field>
            <Field label="Phụ đề">
              <input
                className="form__input"
                value={draft.rsvp.subtitle || ''}
                onChange={(e) => updateDraft('rsvp.subtitle', e.target.value)}
              />
            </Field>
            <Field label="Hạn chót xác nhận">
              <input
                className={`form__input${invalid('rsvp.deadline')}`}
                type="date"
                value={draft.rsvp.deadline || ''}
                onChange={(e) => updateDraft('rsvp.deadline', e.target.value)}
              />
            </Field>
          </div>
          <h3 style={{ fontSize: 14.5, margin: '14px 0 4px' }}>Bật/tắt từng trường trong form</h3>
          <Switch label="Họ tên" checked={draft.rsvp.fields.name} onChange={(v) => updateDraft('rsvp.fields.name', v)} ariaLabel="Trường họ tên" />
          <Switch label="Số điện thoại" checked={draft.rsvp.fields.phone} onChange={(v) => updateDraft('rsvp.fields.phone', v)} ariaLabel="Trường số điện thoại" />
          <Switch label="Email" checked={draft.rsvp.fields.email} onChange={(v) => updateDraft('rsvp.fields.email', v)} ariaLabel="Trường email" />
          <Switch label="Số người đi cùng" checked={draft.rsvp.fields.guests} onChange={(v) => updateDraft('rsvp.fields.guests', v)} ariaLabel="Trường số người" />
          <Switch label="Bên nhà trai / nhà gái" checked={draft.rsvp.fields.side} onChange={(v) => updateDraft('rsvp.fields.side', v)} ariaLabel="Trường bên" />
          <Switch label="Tham dự lễ nào" checked={draft.rsvp.fields.ceremonies} onChange={(v) => updateDraft('rsvp.fields.ceremonies', v)} ariaLabel="Trường lễ tham dự" />
          <Switch label="Lời nhắn" checked={draft.rsvp.fields.message} onChange={(v) => updateDraft('rsvp.fields.message', v)} ariaLabel="Trường lời nhắn" />
          <h3 style={{ fontSize: 14.5, margin: '16px 0 8px' }}>Nội dung câu hỏi trong form</h3>
          <Field label="Câu hỏi số người đi cùng">
            <input
              className="form__input"
              value={draft.rsvp.questions.guests || ''}
              onChange={(e) => updateDraft('rsvp.questions.guests', e.target.value)}
            />
          </Field>
          <Field label="Câu hỏi bên nhà trai / nhà gái">
            <input
              className="form__input"
              value={draft.rsvp.questions.side || ''}
              onChange={(e) => updateDraft('rsvp.questions.side', e.target.value)}
            />
          </Field>
          <Field label="Câu hỏi tham dự lễ nào">
            <input
              className="form__input"
              value={draft.rsvp.questions.ceremonies || ''}
              onChange={(e) => updateDraft('rsvp.questions.ceremonies', e.target.value)}
            />
          </Field>
          <Field label="Câu hỏi lời nhắn">
            <input
              className="form__input"
              value={draft.rsvp.questions.message || ''}
              onChange={(e) => updateDraft('rsvp.questions.message', e.target.value)}
            />
          </Field>
          <Field label="Các lựa chọn “Tham dự lễ nào” (mỗi dòng 1 lựa chọn)">
            <textarea
              className="form__textarea"
              value={(draft.rsvp.ceremonyOptions || []).join('\n')}
              onChange={(e) => {
                const value = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                mutateDraft((d) => {
                  d.rsvp.ceremonyOptions = value;
                });
              }}
              placeholder={'Lễ Ăn Hỏi\nLễ Cưới\nCả hai lễ'}
            />
          </Field>
        </div>
      </section>
    );
  }

  // ==================================================================
  // 12. SEO & CHIA SẺ
  // ==================================================================
  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg || 'Đã sao chép ✓');
    } catch {
      window.prompt('Sao chép:', text);
    }
  }

  function downloadQrPng() {
    if (!qrSvg) {
      toast('Mã QR chưa sẵn sàng, thử lại sau giây lát.', 'error');
      return;
    }
    const svgBlob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 400, 400);
      ctx.drawImage(img, 0, 0, 400, 400);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, 'thiep-cuoi-qr.png');
        toast('Đã tải mã QR (PNG) ✓');
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast('Không tạo được ảnh QR.', 'error');
    };
    img.src = url;
  }

  function handleGenerateLinks() {
    const names = guestListText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!names.length) {
      toast('Hãy dán danh sách tên khách (mỗi dòng 1 tên).', 'error');
      return;
    }
    const base = invitationUrl();
    setGuestLinks(names.map((name) => ({ name, link: base + '?guest=' + encodeURIComponent(name) })));
    toast(`Đã tạo ${names.length} link cá nhân hoá ✓`);
  }

  function renderSeo() {
    const domain = String(draft.site.domain || '').trim();
    let host = 'thiepcuoi.vn';
    try {
      if (domain) host = new URL(domain).hostname;
      else host = new URL(invitationUrl()).hostname || host;
    } catch {
      /* giữ host mặc định */
    }
    const fav = String(draft.site.favicon || '💍');
    return (
      <section className="screen is-active" id="screen-seo" data-title="SEO & Chia sẻ">
        <div className="screen__head">
          <h1 className="screen__title">SEO &amp; Chia sẻ</h1>
          <p className="screen__desc">Tiêu đề, mô tả, ảnh chia sẻ, mã QR và link cá nhân hoá cho từng khách.</p>
        </div>
        <div className="card">
          <Field label="Tiêu đề trang (title)" required hint="Hiện trên tab trình duyệt và khi chia sẻ link.">
            <input
              className={`form__input${invalid('site.title')}`}
              value={draft.site.title || ''}
              onChange={(e) => updateDraft('site.title', e.target.value)}
              required
              maxLength={120}
            />
          </Field>
          <Field label="Meta description" hint="Mô tả ngắn gọn (nên dưới 160 ký tự) hiện khi chia sẻ link và trên Google.">
            <textarea
              className="form__textarea"
              value={draft.site.metaDescription || ''}
              onChange={(e) => updateDraft('site.metaDescription', e.target.value)}
              maxLength={300}
            />
          </Field>
          <Field label="Ảnh chia sẻ (og:image) — tỉ lệ 1.91:1">
            {draft.site.ogImage ? (
              <img
                alt="Ảnh chia sẻ"
                src={draft.site.ogImage}
                style={{ width: '100%', maxWidth: 480, aspectRatio: '1.91/1', objectFit: 'cover', borderRadius: 10, border: '1px solid var(--admin-border)', display: 'block', marginBottom: 10 }}
              />
            ) : (
              <p className="form__hint">Chưa có ảnh chia sẻ.</p>
            )}
            <div className="card__actions" style={{ marginTop: 0 }}>
              <label className="btn btn--sm" htmlFor="ogFileInput">
                <Icon name="upload" size={14} /> Chọn &amp; chỉnh ảnh</label>
              <><input
                type="file"
                id="ogFileInput"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files[0];
                  e.target.value = '';
                  if (!f) return;
                  const dataUrl = await uploadImage(f, { cropAspect: 1.91 });
                  if (!dataUrl) return;
                  updateDraft('site.ogImage', dataUrl);
                  toast('Đã cập nhật ảnh chia sẻ ✓');
                }}
              /></>
            </div>
            <input
              className={`form__input${invalid('site.ogImage')}`}
              type="url"
              value={draft.site.ogImage || ''}
              onChange={(e) => updateDraft('site.ogImage', e.target.value)}
              placeholder="https://…/og-image.jpg"
              style={{ marginTop: 10 }}
            />
          </Field>
          <Field label="Favicon (emoji hoặc URL ảnh)">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="form__input"
                value={draft.site.favicon || ''}
                onChange={(e) => updateDraft('site.favicon', e.target.value)}
                placeholder="💍"
                style={{ maxWidth: 220 }}
              />
              <span style={{ fontSize: 28 }}>
                {fav.startsWith('data:image') ? (
                  <img src={fav} alt="favicon" style={{ width: 32, height: 32, borderRadius: 6 }} />
                ) : (
                  fav || '💍'
                )}
              </span>
              <label className="btn btn--sm" htmlFor="faviconFileInput">
                <Icon name="upload" size={14} /> Chọn &amp; chỉnh ảnh</label>
              <><input
                type="file"
                id="faviconFileInput"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files[0];
                  e.target.value = '';
                  if (!f) return;
                  const dataUrl = await uploadImage(f);
                  if (!dataUrl) return;
                  updateDraft('site.favicon', dataUrl);
                  toast('Đã cập nhật favicon ✓');
                }}
              /></>
            </div>
          </Field>
        </div>
        <div className="card">
          <h2 className="card__title">Xem trước khi chia sẻ (Facebook / Zalo)</h2>
          <p className="card__subtitle">Khung giả lập cách link thiệp hiển thị khi được chia sẻ.</p>
          <div className="share-card">
            {draft.site.ogImage && <img src={draft.site.ogImage} alt="Ảnh chia sẻ" />}
            <div className="share-card__body">
              <div className="share-card__domain">{host}</div>
              <div className="share-card__title">{draft.site.title || '—'}</div>
              <div className="share-card__desc">{draft.site.metaDescription || '—'}</div>
            </div>
          </div>
          <div className="card__actions">
            <button className="btn" type="button" onClick={() => copyText(invitationUrl(), 'Đã sao chép link thiệp ✓')}>
              <Icon name="copy" size={15} /> Sao chép link thiệp
            </button>
            <a className="btn" href="/" target="_blank" rel="noopener">
              Mở thiệp
            </a>
          </div>
        </div>
        <div className="card">
          <h2 className="card__title">Mã QR của thiệp</h2>
          <p className="card__subtitle">Quét mã để mở thiệp ngay. In mã lên thiệp giấy cũng được.</p>
          <div className="qr-wrap">
            {qrReady ? (
              <div dangerouslySetInnerHTML={{ __html: qrSvg }} aria-label="Mã QR mở thiệp cưới" />
            ) : (
              <p className="form__hint">Không tải được thư viện QR (cần file qrcode-generator.js).</p>
            )}
          </div>
          <div className="card__actions" style={{ justifyContent: 'center' }}>
            <button className="btn" type="button" onClick={downloadQrPng}>
              <Icon name="download" size={15} /> Tải mã QR (PNG)
            </button>
          </div>
        </div>
        <div className="card">
          <h2 className="card__title">Link cá nhân hoá cho từng khách</h2>
          <p className="card__subtitle">
            Dán danh sách tên khách (mỗi dòng 1 tên) → tạo hàng loạt link dạng <code>index.html?guest=Tên-Khách</code>. Dấu tiếng
            Việt được giữ nguyên (encodeURIComponent).
          </p>
          <Field label="Danh sách tên khách">
            <textarea
              className="form__textarea"
              value={guestListText}
              onChange={(e) => setGuestListText(e.target.value)}
              placeholder={'Nguyễn Văn An\nTrần Thị Bình\nLê Minh Anh'}
              style={{ minHeight: 130 }}
            />
          </Field>
          <div className="card__actions" style={{ marginTop: 0 }}>
            <button className="btn btn--primary" type="button" onClick={handleGenerateLinks}>
              Tạo link hàng loạt
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                if (!guestLinks.length) {
                  toast('Chưa có link nào — hãy tạo link trước.', 'error');
                  return;
                }
                downloadCSV('link-khach-moi.csv', ['Tên khách', 'Link thiệp'], guestLinks.map((g) => [g.name, g.link]));
                toast('Đã xuất CSV link khách ✓');
              }}
            >
              <Icon name="download" size={15} /> Xuất CSV link khách
            </button>
          </div>
          {guestLinks.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tên khách</th>
                    <th>Link</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {guestLinks.map((g, i) => (
                    <tr key={`${g.name}-${i}`}>
                      <td>
                        <strong>{g.name}</strong>
                      </td>
                      <td className="link-result">{g.link}</td>
                      <td>
                        <button className="btn btn--sm" type="button" onClick={() => copyText(g.link, 'Đã sao chép link ✓')}>
                          Copy
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    );
  }

  // ==================================================================
  // 13. SAO LƯU & DỮ LIỆU
  // ==================================================================
  async function handleImportConfig(file) {
    if (!file) return;
    try {
      const result = await importConfig(file);
      draftRef.current = result.config;
      lastSavedRef.current = deepClone(result.config);
      dirtyRef.current = false;
      setDirty(false);
      setInvalidPaths(new Set());
      bump();
      notifyPreview();
      setStorageTick((t) => t + 1);
      toast('Nhập cấu hình thành công ✓ — toàn bộ form đã tải lại.');
    } catch (err) {
      toast('Nhập cấu hình thất bại: ' + (err.message || 'lỗi không rõ.'), 'error');
    }
  }

  async function handleResetConfig() {
    if (!window.confirm('Khôi phục toàn bộ cấu hình về mặc định? Mọi thay đổi chưa xuất file sẽ mất.')) return;
    try {
      draftRef.current = await resetConfig();
      lastSavedRef.current = deepClone(draftRef.current);
      dirtyRef.current = false;
      setDirty(false);
      setInvalidPaths(new Set());
      bump();
      notifyPreview();
      setStorageTick((t) => t + 1);
      toast('Đã khôi phục cấu hình mặc định ✓');
    } catch (err) {
      toast(`Khôi phục thất bại: ${err.message || 'hãy thử lại.'}`, 'error');
    }
  }

  function downloadJson(filename, data) {
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
  }

  /** Nhập JSON mảng lời chúc / RSVP — validate từng mục, ghi qua store. */
  async function importListFile(file, kind) {
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (err) {
      toast('File JSON sai định dạng: ' + err.message, 'error');
      return;
    }
    if (!Array.isArray(parsed)) {
      toast('File phải chứa một mảng JSON (danh sách).', 'error');
      return;
    }
    let added = 0;
    const errors = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item || typeof item !== 'object') {
        errors.push(`Mục ${i + 1}: không phải object.`);
        continue;
      }
      if (kind === 'wishes') {
        if (!String(item.name || '').trim() || !String(item.message || '').trim()) {
          errors.push(`Mục ${i + 1}: thiếu tên hoặc lời chúc.`);
          continue;
        }
        const r = await addWish({ name: item.name, email: item.email || '', message: item.message, approved: item.approved !== undefined ? !!item.approved : true });
        if (r.ok) added++;
        else errors.push(`Mục ${i + 1}: ${r.error}`);
      } else {
        if (!String(item.name || '').trim() || !/^0\d{9}$/.test(String(item.phone || '').trim())) {
          errors.push(`Mục ${i + 1}: thiếu tên hoặc SĐT 10 số hợp lệ.`);
          continue;
        }
        const r = await addRsvp({ name: item.name, phone: item.phone, email: item.email || '', guests: item.guests || 1, side: item.side || '', ceremonies: item.ceremonies || '', message: item.message || '', status: item.status || 'yes' });
        if (r.ok) added++;
        else errors.push(`Mục ${i + 1}: ${r.error}`);
      }
    }
    await refreshLists();
    if (errors.length) toast(`Đã nhập ${added} mục, ${errors.length} mục lỗi. Lỗi đầu: ${errors[0]}`, 'error');
    else toast(`Đã nhập ${added} mục thành công ✓`);
  }

  function renderBackup() {
    return (
      <section className="screen is-active" id="screen-backup" data-title="Sao lưu & Dữ liệu">
        <div className="screen__head">
          <h1 className="screen__title">Sao lưu &amp; Dữ liệu</h1>
          <p className="screen__desc">Xuất / nhập toàn bộ cấu hình, lời chúc và RSVP để sao lưu hoặc chuyển máy.</p>
        </div>
        <div className="card">
          <h2 className="card__title">Cấu hình thiệp (config.json)</h2>
          <p className="card__subtitle">File config.json chứa toàn bộ nội dung thiệp.</p>
          <div className="card__actions" style={{ marginTop: 0 }}>
            <button
              className="btn btn--primary"
              type="button"
              onClick={async () => {
                try {
                  await exportConfig();
                  toast('Đã xuất config.json ✓ — đặt file này cạnh index.html khi deploy.');
                } catch (err) {
                  toast(`Xuất cấu hình thất bại: ${err.message || 'hãy thử lại.'}`, 'error');
                }
              }}
            >
              <Icon name="download" size={15} /> Xuất cấu hình (config.json)
            </button>
            <label className="btn" htmlFor="importConfigFile">
              <Icon name="upload" size={15} /> Nhập cấu hình
            </label>
            <input
              type="file"
              id="importConfigFile"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (f) handleImportConfig(f);
              }}
            />
            <button className="btn btn--danger" type="button" onClick={handleResetConfig}>
              <Icon name="refresh" size={15} /> Khôi phục mặc định
            </button>
          </div>
          <p className="form__hint">
            Cấu hình đang được đồng bộ lên Firestore. File <code>config.json</code> chỉ dùng để sao lưu hoặc triển khai dự phòng.
          </p>
        </div>
        <div className="card">
          <h2 className="card__title">Lời chúc &amp; RSVP</h2>
          <div className="card__actions" style={{ marginTop: 0 }}>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                try {
                  downloadJson('loi-chuc.json', await getWishes());
                  toast('Đã xuất lời chúc (JSON) ✓');
                } catch (err) {
                  toast(`Xuất lời chúc thất bại: ${err.message || 'hãy thử lại.'}`, 'error');
                }
              }}
            >
              <Icon name="download" size={15} /> Xuất lời chúc (JSON)
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                try {
                  downloadJson('rsvp.json', await getRsvps());
                  toast('Đã xuất RSVP (JSON) ✓');
                } catch (err) {
                  toast(`Xuất RSVP thất bại: ${err.message || 'hãy thử lại.'}`, 'error');
                }
              }}
            >
              <Icon name="download" size={15} /> Xuất RSVP (JSON)
            </button>
            <label className="btn" htmlFor="importWishesFile">
              <Icon name="upload" size={15} /> Nhập lời chúc (JSON)
            </label>
            <input
              type="file"
              id="importWishesFile"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (f) importListFile(f, 'wishes');
              }}
            />
            <label className="btn" htmlFor="importRsvpFile">
              <Icon name="upload" size={15} /> Nhập RSVP (JSON)
            </label>
            <input
              type="file"
              id="importRsvpFile"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (f) importListFile(f, 'rsvp');
              }}
            />
          </div>
          <p className="form__hint">File nhập phải là JSON mảng các đối tượng (đúng định dạng file đã xuất). Nhập sai định dạng sẽ báo lỗi cụ thể và không ghi đè dữ liệu cũ.</p>
        </div>
        <div className="card">
          <h2 className="card__title">Dung lượng localStorage trên thiết bị</h2>
          <StorageBar usage={usage} />
          <p className="form__hint">Đây chỉ là dung lượng tuỳ chọn cục bộ của dashboard. Cấu hình, lời chúc, RSVP và ảnh được lưu trên Firebase.</p>
        </div>
      </section>
    );
  }

  // ==================================================================
  // 14. CÀI ĐẶT TÀI KHOẢN
  // ==================================================================
  async function submitChangePassword(e) {
    e.preventDefault();
    const { oldPw, newPw, newPw2 } = pwForm;
    if (!oldPw || !newPw || !newPw2) {
      toast('Vui lòng nhập đủ 3 ô mật khẩu.', 'error');
      return;
    }
    if (newPw.length < 6) {
      toast('Mật khẩu mới phải có tối thiểu 6 ký tự.', 'error');
      return;
    }
    if (newPw !== newPw2) {
      toast('Hai lần nhập mật khẩu mới chưa khớp.', 'error');
      return;
    }
    try {
      await changeAdminPassword(oldPw, newPw);
      setPwForm({ oldPw: '', newPw: '', newPw2: '' });
      toast('Đổi mật khẩu thành công ✓');
    } catch (err) {
      const message = ['auth/invalid-credential', 'auth/wrong-password'].includes(err.code)
        ? 'Mật khẩu hiện tại không đúng.'
        : err.message || 'Không thể đổi mật khẩu. Hãy đăng nhập lại rồi thử lại.';
      toast(message, 'error');
    }
  }

  function renderAccount() {
    return (
      <section className="screen is-active" id="screen-account" data-title="Cài đặt tài khoản">
        <div className="screen__head">
          <h1 className="screen__title">Cài đặt tài khoản</h1>
          <p className="screen__desc">Đổi mật khẩu Firebase Authentication và tuỳ chọn hiển thị dashboard.</p>
        </div>
        <div className="card">
          <h2 className="card__title">Đổi mật khẩu quản trị</h2>
          <p className="card__subtitle">
            Mật khẩu được quản lý an toàn bởi Firebase Authentication.
          </p>
          <form noValidate onSubmit={submitChangePassword}>
            <Field label="Mật khẩu cũ" required>
              <input
                className="form__input"
                type="password"
                value={pwForm.oldPw}
                onChange={(e) => setPwForm((prev) => ({ ...prev, oldPw: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label="Mật khẩu mới (tối thiểu 6 ký tự)" required>
              <input
                className="form__input"
                type="password"
                value={pwForm.newPw}
                onChange={(e) => setPwForm((prev) => ({ ...prev, newPw: e.target.value }))}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Nhập lại mật khẩu mới" required>
              <input
                className="form__input"
                type="password"
                value={pwForm.newPw2}
                onChange={(e) => setPwForm((prev) => ({ ...prev, newPw2: e.target.value }))}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </Field>
            <button className="btn btn--primary" type="submit">
              Đổi mật khẩu
            </button>
          </form>
        </div>
        <div className="card">
          <h2 className="card__title">Hiển thị dashboard</h2>
          <Switch
            label="Chế độ tối"
            desc={
              <>
                Lưu vào localStorage khoá <code>wedding_admin_dark</code>, áp class <code>admin--dark</code> lên body.
              </>
            }
            checked={dark}
            onChange={applyDarkMode}
            ariaLabel="Bật chế độ tối"
          />
          <div className="card__actions">
            <button className="btn btn--danger" type="button" onClick={handleLogout}>
              <Icon name="logout" size={15} /> Đăng xuất khỏi dashboard
            </button>
          </div>
        </div>
        <div className="card">
          <h2 className="card__title">Lưu ý bảo mật</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7 }}>
            Không chia sẻ thông tin đăng nhập quản trị. Firestore Rules giới hạn dữ liệu RSVP và quyền sửa cấu hình cho UID admin.
          </p>
        </div>
      </section>
    );
  }

  // ==================================================================
  // Khung chính
  // ==================================================================
  const frameClass =
    previewDevice === 'phone'
      ? 'preview__frame preview__frame--phone'
      : previewDevice === 'tablet'
        ? 'preview__frame preview__frame--tablet'
        : 'preview__frame';

  return (
    <div className="admin">
      {imageEditor && <ImageEditor {...imageEditor} onDone={(result) => {
        if (imageEditorResolve.current !== imageEditor.resolve) return;
        const resolve = imageEditorResolve.current;
        imageEditorResolve.current = null;
        setImageEditor(null);
        resolve?.(result);
      }} />}
      <div
        className={`sidebar__backdrop${sidebarOpen ? ' is-show' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar${sidebarOpen ? ' is-open' : ''}`} aria-label="Menu quản trị">
        <div className="sidebar__brand">
          <div className="sidebar__brand-title">
            <Icon name="heart" size={17} /> Thiệp Cưới Admin
          </div>
          <div className="sidebar__brand-sub">Quản trị thiệp cưới online</div>
        </div>
        <nav className="sidebar__nav">
          {MENU.map((m) => (
            <button
              key={m.id}
              className={`sidebar__item${screen === m.id ? ' is-active' : ''}`}
              type="button"
              onClick={() => showScreen(m.id)}
            >
              <span className="sidebar__item-icon">
                <Icon name={m.icon} size={17} />
              </span>
              {m.label}
            </button>
          ))}
        </nav>
        <div className="sidebar__foot">
          <button className="btn btn--ghost btn--sm" type="button" onClick={handleLogout}>
            <Icon name="logout" size={14} /> Đăng xuất
          </button>
          <div style={{ marginTop: 6 }}>Phiên đăng nhập hết khi đóng tab.</div>
        </div>
      </aside>

      <header className="topbar">
        <button className="topbar__menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Mở menu">
          <Icon name="menu" size={18} />
        </button>
        <div className="topbar__title">{SCREEN_TITLES[screen] || 'Quản trị'}</div>
        <div className="topbar__save-status">
          <span className={`topbar__dot${dirty ? ' is-dirty' : ''}`} />
          <span role="status" title={configLoadError || undefined}>{saving ? 'Đang lưu…' : !configReady ? (configLoadError ? 'Lỗi tải cấu hình' : 'Đang tải cấu hình…') : getPendingImages(draftRef.current).length ? 'Ảnh đang xem trước — bấm Lưu thay đổi' : dirty ? 'Chưa lưu thay đổi' : 'Đã lưu ✓'}</span>
        </div>
        <button className="btn btn--sm" type="button" onClick={handleUndo} disabled={saving} title="Khôi phục về bản đã lưu gần nhất">
          <Icon name="undo" size={14} /> Hoàn tác
        </button>
        <a className="btn btn--sm" href="/" target="_blank" rel="noopener">
          <Icon name="eye" size={14} /> Xem thiệp
        </a>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => saveNow(true)} disabled={saving} aria-busy={saving}>
          {saving ? <span className="save-spinner" aria-hidden="true" /> : <Icon name="save" size={14} />}
          {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </header>

      <div className="admin__main">
        <div className="admin__content">
          <div className="admin__layout">
            <div className="admin__screens">
              {screen === 'overview' && renderOverview()}
              {screen === 'general' && renderGeneral()}
              {screen === 'couple' && renderCouple()}
              {screen === 'gift' && renderGift()}
              <div style={{ display: screen === 'giftList' ? 'block' : 'none' }}><WeddingGiftList /></div>
              {screen === 'album' && renderAlbum()}
              {screen === 'events' && renderEvents()}
              {screen === 'video' && renderVideo()}
              {screen === 'music' && renderMusic()}
              {screen === 'theme' && renderTheme()}
              {screen === 'guestbook' && renderGuestbook()}
              {screen === 'rsvp' && renderRsvp()}
              {screen === 'seo' && renderSeo()}
              {screen === 'backup' && renderBackup()}
              {screen === 'account' && renderAccount()}
            </div>

            <aside
              className={`preview${previewOpen ? ' preview--mobile-open' : ' preview--hidden-mobile'}`}
              id="previewPanel"
              aria-label="Xem trước thiệp"
            >
              <div className="preview__head">
                <span className="preview__title">
                  <Icon name="eye" size={15} /> Live Preview
                </span>
                <button
                  className={`preview__device${previewDevice === 'desktop' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                >
                  Máy tính
                </button>
                <button
                  className={`preview__device${previewDevice === 'tablet' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setPreviewDevice('tablet')}
                >
                  Máy tính bảng
                </button>
                <button
                  className={`preview__device${previewDevice === 'phone' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setPreviewDevice('phone')}
                >
                  Điện thoại
                </button>
              </div>
              <div className="preview__frame-wrap">
                <iframe
                  key={previewKey}
                  ref={previewFrameRef}
                  className={frameClass}
                  src="/"
                  title="Xem trước thiệp cưới"
                />
              </div>
              <p className="form__hint" style={{ padding: '0 14px 14px' }}>
                Preview tự cập nhật sau mỗi lần lưu. Nếu chưa có file <code>index.html</code> (phần thiệp đang làm riêng), khung này
                sẽ báo lỗi tải trang — các màn hình cấu hình vẫn dùng bình thường.
              </p>
            </aside>
          </div>
        </div>
      </div>

      <button
        className="fab-preview"
        type="button"
        onClick={() => {
          const next = !previewOpen;
          setPreviewOpen(next);
          if (next) {
            document.getElementById('previewPanel')?.scrollIntoView({ behavior: 'smooth' });
          }
        }}
      >
        {previewOpen ? (
          <>
            <Icon name="x" size={15} /> Đóng xem trước
          </>
        ) : (
          <>
            <Icon name="eye" size={15} /> Xem trước
          </>
        )}
      </button>

      {renderEventModal()}
      {renderWishModal()}
      {renderTextModal()}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast${t.type === 'error' ? ' toast--error' : t.type === 'success' ? ' toast--success' : ''}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
