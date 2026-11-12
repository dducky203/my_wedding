/**
 * store.js — LỚP DỮ LIỆU (data layer) của hệ thống thiệp cưới.
 *
 * QUY TẮC BẮT BUỘC:
 * - Mọi thao tác đọc/ghi dữ liệu (config, lời chúc, RSVP) PHẢI đi qua các hàm
 *   trong file này. Không được đọc/ghi localStorage trực tiếp ở site.js hay admin.js.
 * - Hiện tại dùng localStorage. Khi có backend thật, CHỈ cần thay phần thân
 *   của các hàm dưới đây bằng fetch() gọi API / Firebase — giao diện hàm
 *   (tên hàm, tham số, giá trị trả về) giữ nguyên, code còn lại không đổi.
 *   Mỗi hàm đều có ghi chú "TODO: thay bằng API/Firebase" để dễ tìm.
 *
 * Thứ tự nạp config (trong getConfig):
 *   (1) localStorage → (2) fetch file /config.json → (3) DEFAULT_CONFIG mẫu.
 * Lưu ý: khi mở bằng file:// thì fetch() sẽ lỗi, hàm tự bắt lỗi và rơi về (3).
 */

import { DEFAULT_CONFIG } from './defaultConfig.js';

// ------------------------------------------------------------------
// Khoá lưu trữ & phiên bản
// ------------------------------------------------------------------
export const STORAGE_KEYS = {
  config: 'wedding_config_v1',
  wishes: 'wedding_wishes_v1',
  rsvps: 'wedding_rsvps_v1',
  // Mật khẩu admin (dạng băm SHA-256) — xem admin/login.html
  adminHash: 'wedding_admin_hash',
  // Phiên đăng nhập admin (sessionStorage — đóng tab là hết phiên)
  adminSession: 'wedding_admin_session'
};

// Phiên bản cấu trúc config hiện tại — khớp với DEFAULT_CONFIG.version
export const CONFIG_VERSION = 1;

// Giới hạn dung lượng localStorage (ước lượng ~5MB trên hầu hết trình duyệt)
export const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;

// ------------------------------------------------------------------
// Tiện ích dùng chung
// ------------------------------------------------------------------

/** Tạo id duy nhất, ví dụ: "wish-1712345678901-a3f9" */
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Sao chép sâu một object (để không sửa nhầm object gốc). */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Escape HTML — CHỐNG XSS.
 * Mọi nội dung do người dùng nhập (lời chúc, tên khách, RSVP...) BẮT BUỘC
 * phải chạy qua hàm này trước khi đưa vào innerHTML.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Đo dung lượng localStorage đã dùng (byte) + phần trăm so với giới hạn. */
export function storageUsage() {
  let used = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key) || '';
      used += key.length + value.length;
    }
    // localStorage lưu UTF-16 → mỗi ký tự ~2 byte
    used *= 2;
  } catch (e) {
    // Trình duyệt chặn truy cập storage (chế độ ẩn danh...) → báo 0
    used = 0;
  }
  return {
    usedBytes: used,
    quotaBytes: STORAGE_QUOTA_BYTES,
    percent: Math.min(100, Math.round((used / STORAGE_QUOTA_BYTES) * 100)),
    usedMB: (used / (1024 * 1024)).toFixed(2)
  };
}

// ------------------------------------------------------------------
// CONFIG — cấu hình thiệp
// ------------------------------------------------------------------

/**
 * Nâng cấp cấu trúc config cũ lên phiên bản mới (không làm hỏng dữ liệu cũ).
 * Ví dụ: bản sau thêm trường mới thì ở đây gán giá trị mặc định cho trường đó.
 */
export function migrateConfig(config) {
  const cfg = deepClone(config || {});
  // Chưa có version (dữ liệu rất cũ) → coi như bản 1
  if (typeof cfg.version !== 'number') cfg.version = 1;

  // --- Nâng cấp từ v1 lên các bản sau: thêm case mới tại đây ---
  // case v1 → v2: if (cfg.version === 1) { ...; cfg.version = 2; }

  // Đảm bảo các nhánh bắt buộc luôn tồn tại (phòng khi config cũ thiếu)
  const fallback = DEFAULT_CONFIG;
  for (const key of Object.keys(fallback)) {
    if (cfg[key] === undefined) cfg[key] = deepClone(fallback[key]);
  }
  cfg.version = CONFIG_VERSION;
  return cfg;
}

/**
 * Lấy config hiện tại.
 * Thứ tự: (1) localStorage → (2) fetch /config.json → (3) DEFAULT_CONFIG.
 * Luôn trả về object đã migrate, không bao giờ trả về null.
 */
// TODO: thay bằng API/Firebase — ví dụ: GET /api/config (kèm fallback local)
export async function getConfig() {
  // (1) localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.config);
    if (raw) {
      const parsed = JSON.parse(raw);
      return migrateConfig(parsed);
    }
  } catch (e) {
    console.warn('[store] Không đọc được config trong localStorage:', e);
  }

  // (2) file config.json đặt cạnh index.html (khi deploy)
  try {
    const url = new URL('../config.json', import.meta.url);
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const parsed = await res.json();
      return migrateConfig(parsed);
    }
  } catch (e) {
    // Mở bằng file:// hoặc chưa có file config.json → bỏ qua, dùng mẫu
  }

  // (3) Dữ liệu mẫu
  return deepClone(DEFAULT_CONFIG);
}

/** Lấy config đồng bộ (chỉ từ localStorage, dùng trong Dashboard). */
export function getConfigSync() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.config);
    if (raw) return migrateConfig(JSON.parse(raw));
  } catch (e) {
    console.warn('[store] Không đọc được config trong localStorage:', e);
  }
  return deepClone(DEFAULT_CONFIG);
}

/**
 * Lưu config (ghi đè toàn bộ).
 * Trả về { ok: true } hoặc { ok: false, error: '...' } khi localStorage đầy.
 */
// TODO: thay bằng API/Firebase — ví dụ: PUT /api/config
export function saveConfig(config) {
  try {
    const cfg = migrateConfig(config);
    localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(cfg));
    return { ok: true, config: cfg };
  } catch (e) {
    // Thường gặp nhất: QuotaExceededError — localStorage đầy do ảnh base64
    console.error('[store] Lưu config thất bại:', e);
    return {
      ok: false,
      error:
        'Bộ nhớ trình duyệt đã đầy (localStorage ~5MB). Hãy xoá bớt ảnh đã upload (dùng URL ảnh thay vì upload) hoặc xuất config ra file JSON rồi khôi phục mặc định.'
    };
  }
}

/** Xoá config đã lưu, quay về dữ liệu mẫu mặc định. */
// TODO: thay bằng API/Firebase — ví dụ: DELETE /api/config
export function resetConfig() {
  try {
    localStorage.removeItem(STORAGE_KEYS.config);
  } catch (e) {
    console.warn('[store] Không xoá được config:', e);
  }
  return deepClone(DEFAULT_CONFIG);
}

/**
 * Xuất config thành file config.json để tải về.
 * Hướng dẫn: đặt file này cạnh index.html khi deploy để khách thấy cấu hình.
 */
// TODO: thay bằng API/Firebase — ví dụ: GET /api/config/export
export function exportConfig() {
  const config = getConfigSync();
  const blob = new Blob([JSON.stringify(config, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'config.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return config;
}

/**
 * Nhập config từ file JSON (File object từ <input type="file">).
 * Validate cấu trúc trước khi áp dụng — sai định dạng thì báo lỗi cụ thể.
 * Trả về Promise<{ ok: true, config }> hoặc throw Error với thông điệp rõ ràng.
 */
// TODO: thay bằng API/Firebase — ví dụ: POST /api/config/import
export async function importConfig(file) {
  if (!file) throw new Error('Chưa chọn file để nhập.');
  let text;
  try {
    text = await file.text();
  } catch (e) {
    throw new Error('Không đọc được file. Hãy thử chọn lại file JSON.');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`File JSON sai định dạng: ${e.message}. Hãy kiểm tra lại file (dấu ngoặc, dấu phẩy...).`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('File JSON không chứa object cấu hình hợp lệ.');
  }
  if (!parsed.couple || typeof parsed.couple !== 'object') {
    throw new Error('Thiếu trường bắt buộc "couple" (thông tin cô dâu chú rể). Đây có phải file config của thiệp cưới không?');
  }
  if (!parsed.theme || typeof parsed.theme !== 'object') {
    throw new Error('Thiếu trường bắt buộc "theme" (giao diện).');
  }
  if (!Array.isArray(parsed.sections)) {
    throw new Error('Thiếu trường bắt buộc "sections" (danh sách section, phải là mảng).');
  }
  const config = migrateConfig(parsed);
  const saved = saveConfig(config);
  if (!saved.ok) throw new Error(saved.error);
  return { ok: true, config };
}

// ------------------------------------------------------------------
// LỜI CHÚC (Sổ lưu bút)
// ------------------------------------------------------------------

// Lời chúc mẫu — chỉ dùng lần đầu khi chưa có lời chúc nào trong máy.
const SAMPLE_WISHES = [
  {
    id: 'wish-sample-1',
    name: 'Gia đình nhà trai',
    email: '',
    message: 'Chúc hai con trăm năm hạnh phúc, sớm sinh quý tử!',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    approved: true
  },
  {
    id: 'wish-sample-2',
    name: 'Minh Anh',
    email: '',
    message: 'Chúc mừng hạnh phúc hai bạn! Cuối cùng ngày này cũng đến, mừng cho hai bạn lắm!',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    approved: true
  }
];

function readList(key, seed = []) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      if (seed.length) localStorage.setItem(key, JSON.stringify(seed));
      return deepClone(seed);
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : deepClone(seed);
  } catch (e) {
    console.warn(`[store] Không đọc được ${key}:`, e);
    return deepClone(seed);
  }
}

function writeList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return { ok: true };
  } catch (e) {
    console.error(`[store] Lưu ${key} thất bại:`, e);
    return {
      ok: false,
      error: 'Bộ nhớ trình duyệt đã đầy. Hãy xoá bớt dữ liệu cũ hoặc xuất ra file rồi xoá.'
    };
  }
}

/** Lấy toàn bộ lời chúc (mới nhất lên đầu). */
// TODO: thay bằng API/Firebase — ví dụ: GET /api/wishes
export function getWishes() {
  const list = readList(STORAGE_KEYS.wishes, SAMPLE_WISHES);
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/** Thêm một lời chúc mới. `wish` = { name, email?, message, approved? } */
// TODO: thay bằng API/Firebase — ví dụ: POST /api/wishes
export function addWish(wish) {
  const list = getWishes();
  const item = {
    id: uid('wish'),
    name: String(wish.name || 'Khách mời').trim(),
    email: String(wish.email || '').trim(),
    message: String(wish.message || '').trim(),
    createdAt: new Date().toISOString(),
    approved: wish.approved !== undefined ? !!wish.approved : true
  };
  list.unshift(item);
  const result = writeList(STORAGE_KEYS.wishes, list);
  return result.ok ? { ok: true, wish: item } : { ok: false, error: result.error };
}

/** Xoá một lời chúc theo id. */
// TODO: thay bằng API/Firebase — ví dụ: DELETE /api/wishes/:id
export function deleteWish(id) {
  const list = getWishes().filter((w) => w.id !== id);
  return writeList(STORAGE_KEYS.wishes, list);
}

/** Duyệt (cho hiển thị) một lời chúc đang chờ duyệt. */
// TODO: thay bằng API/Firebase — ví dụ: PATCH /api/wishes/:id { approved: true }
export function approveWish(id) {
  const list = getWishes();
  const item = list.find((w) => w.id === id);
  if (!item) return { ok: false, error: 'Không tìm thấy lời chúc.' };
  item.approved = true;
  return writeList(STORAGE_KEYS.wishes, list);
}

/** Ẩn một lời chúc đã duyệt (đưa về trạng thái chờ duyệt). */
// TODO: thay bằng API/Firebase — ví dụ: PATCH /api/wishes/:id { approved: false }
export function hideWish(id) {
  const list = getWishes();
  const item = list.find((w) => w.id === id);
  if (!item) return { ok: false, error: 'Không tìm thấy lời chúc.' };
  item.approved = false;
  return writeList(STORAGE_KEYS.wishes, list);
}

// ------------------------------------------------------------------
// RSVP / KHÁCH MỜI
// ------------------------------------------------------------------

/** Lấy toàn bộ RSVP (mới nhất lên đầu). */
// TODO: thay bằng API/Firebase — ví dụ: GET /api/rsvps
export function getRsvps() {
  const list = readList(STORAGE_KEYS.rsvps, []);
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Thêm một RSVP mới.
 * `rsvp` = { name, phone, email?, guests, side?, ceremonies?, message?, status? }
 * Trả về { ok: true, rsvp } hoặc { ok: false, error }.
 */
// TODO: thay bằng API/Firebase — ví dụ: POST /api/rsvps
export function addRsvp(rsvp) {
  const list = getRsvps();
  const item = {
    id: uid('rsvp'),
    name: String(rsvp.name || '').trim(),
    phone: String(rsvp.phone || '').trim(),
    email: String(rsvp.email || '').trim(),
    guests: Number(rsvp.guests) || 1,
    side: rsvp.side || '',
    ceremonies: rsvp.ceremonies || '',
    status: rsvp.status || 'yes', // yes | no | maybe
    message: String(rsvp.message || '').trim(),
    createdAt: new Date().toISOString()
  };
  list.unshift(item);
  const result = writeList(STORAGE_KEYS.rsvps, list);
  return result.ok ? { ok: true, rsvp: item } : { ok: false, error: result.error };
}

/** Xoá một RSVP theo id. */
// TODO: thay bằng API/Firebase — ví dụ: DELETE /api/rsvps/:id
export function deleteRsvp(id) {
  const list = getRsvps().filter((r) => r.id !== id);
  return writeList(STORAGE_KEYS.rsvps, list);
}

/** Đổi trạng thái một RSVP (yes / no / maybe). */
// TODO: thay bằng API/Firebase — ví dụ: PATCH /api/rsvps/:id
export function updateRsvpStatus(id, status) {
  const list = getRsvps();
  const item = list.find((r) => r.id === id);
  if (!item) return { ok: false, error: 'Không tìm thấy khách mời.' };
  item.status = status;
  return writeList(STORAGE_KEYS.rsvps, list);
}
