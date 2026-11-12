/**
 * store.js — LỚP DỮ LIỆU (data layer) của hệ thống thiệp cưới.
 *
 * QUY TẮC BẮT BUỘC:
 * - Mọi thao tác đọc/ghi dữ liệu (config, lời chúc, RSVP) PHẢI đi qua các hàm
 *   trong file này. Không được đọc/ghi localStorage trực tiếp ở site.js hay admin.js.
 * - Config, lời chúc và RSVP dùng Firebase; tuỳ chọn giao diện cục bộ vẫn dùng localStorage.
 *
 * Thứ tự nạp config: Firestore → localStorage cũ → file config.json → mặc định.
 * Lưu ý: khi mở bằng file:// thì fetch() sẽ lỗi, hàm tự bắt lỗi và rơi về (3).
 */

import { DEFAULT_CONFIG } from './defaultConfig.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase.js';

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
 * Lấy config từ Firestore; chỉ fallback nếu tài liệu chưa được tạo.
 */
export async function getConfig() {
  const remote = await getDoc(doc(db, 'site', 'config'));
  if (remote.exists()) return migrateConfig(remote.data());

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.config);
    if (raw) {
      const parsed = JSON.parse(raw);
      return migrateConfig(parsed);
    }
  } catch (e) {
    console.warn('[store] Không đọc được config trong localStorage:', e);
  }

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
 * Lưu config (ghi đè toàn bộ) lên Firestore.
 */
export async function saveConfig(config) {
  try {
    const cfg = migrateConfig(config);
    const bytes = new TextEncoder().encode(JSON.stringify(cfg)).length;
    if (bytes >= 900 * 1024) {
      return {
        ok: false,
        error: 'Cấu hình quá lớn cho Firestore. Hãy dùng URL ảnh thay vì dữ liệu ảnh base64.'
      };
    }
    await setDoc(doc(db, 'site', 'config'), cfg);
    return { ok: true, config: cfg };
  } catch (e) {
    console.error('[store] Lưu config thất bại:', e);
    return { ok: false, error: e.message || 'Không thể lưu cấu hình lên Firebase.' };
  }
}

/** Ghi cấu hình mặc định lên Firestore. */
export async function resetConfig() {
  try {
    localStorage.removeItem(STORAGE_KEYS.config);
  } catch (e) {
    console.warn('[store] Không xoá được config:', e);
  }
  const result = await saveConfig(DEFAULT_CONFIG);
  if (!result.ok) throw new Error(result.error);
  return result.config;
}

/**
 * Xuất config thành file config.json để tải về.
 * Hướng dẫn: đặt file này cạnh index.html khi deploy để khách thấy cấu hình.
 */
export async function exportConfig() {
  const config = await getConfig();
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
  const saved = await saveConfig(config);
  if (!saved.ok) throw new Error(saved.error);
  return { ok: true, config };
}

// ------------------------------------------------------------------
// LỜI CHÚC (Sổ lưu bút)
// ------------------------------------------------------------------

/** Lấy toàn bộ lời chúc (mới nhất lên đầu). */
export async function getWishes(approvedOnly = false) {
  const wishesRef = collection(db, 'wishes');
  const snapshot = await getDocs(
    approvedOnly ? query(wishesRef, where('approved', '==', true)) : wishesRef,
  );
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/** Thêm một lời chúc mới. `wish` = { name, email?, message, approved? } */
export async function addWish(wish) {
  const item = {
    name: String(wish.name || 'Khách mời').trim(),
    email: String(wish.email || '').trim(),
    message: String(wish.message || '').trim(),
    createdAt: new Date().toISOString(),
    approved: wish.approved !== undefined ? !!wish.approved : true
  };
  try {
    const result = await addDoc(collection(db, 'wishes'), item);
    return { ok: true, wish: { id: result.id, ...item } };
  } catch (e) {
    console.error('[store] Gửi lời chúc thất bại:', e);
    return { ok: false, error: e.message || 'Không thể lưu lời chúc lên Firebase.' };
  }
}

/** Xoá một lời chúc theo id. */
export async function deleteWish(id) {
  try {
    await deleteDoc(doc(db, 'wishes', id));
    return { ok: true };
  } catch (e) {
    console.error('[store] Xoá lời chúc thất bại:', e);
    return { ok: false, error: e.message || 'Không thể xoá lời chúc.' };
  }
}

/** Duyệt (cho hiển thị) một lời chúc đang chờ duyệt. */
export async function approveWish(id) {
  try {
    await updateDoc(doc(db, 'wishes', id), { approved: true });
    return { ok: true };
  } catch (e) {
    console.error('[store] Duyệt lời chúc thất bại:', e);
    return { ok: false, error: e.message || 'Không thể duyệt lời chúc.' };
  }
}

/** Ẩn một lời chúc đã duyệt (đưa về trạng thái chờ duyệt). */
export async function hideWish(id) {
  try {
    await updateDoc(doc(db, 'wishes', id), { approved: false });
    return { ok: true };
  } catch (e) {
    console.error('[store] Ẩn lời chúc thất bại:', e);
    return { ok: false, error: e.message || 'Không thể ẩn lời chúc.' };
  }
}

// ------------------------------------------------------------------
// RSVP / KHÁCH MỜI
// ------------------------------------------------------------------

/** Lấy toàn bộ RSVP; quyền đọc Firestore chỉ cấp cho admin. */
export async function getRsvps() {
  const snapshot = await getDocs(collection(db, 'rsvps'));
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Thêm một RSVP mới.
 * `rsvp` = { name, phone, email?, guests, side?, ceremonies?, message?, status? }
 * Trả về { ok: true, rsvp } hoặc { ok: false, error }.
 */
export async function addRsvp(rsvp) {
  const item = {
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
  try {
    await setDoc(doc(db, 'rsvps', item.phone), item);
    return { ok: true, rsvp: { id: item.phone, ...item } };
  } catch (e) {
    console.error('[store] Lưu RSVP thất bại:', e);
    const error = e.code === 'permission-denied'
      ? 'SĐT này có thể đã xác nhận hoặc Firestore Rules chưa được cài đúng.'
      : e.message || 'Không thể lưu RSVP lên Firebase.';
    return { ok: false, error };
  }
}

/** Xoá một RSVP theo id. */
export async function deleteRsvp(id) {
  try {
    await deleteDoc(doc(db, 'rsvps', id));
    return { ok: true };
  } catch (e) {
    console.error('[store] Xoá RSVP thất bại:', e);
    return { ok: false, error: e.message || 'Không thể xoá RSVP.' };
  }
}

/** Đổi trạng thái một RSVP (yes / no / maybe). */
export async function updateRsvpStatus(id, status) {
  try {
    await updateDoc(doc(db, 'rsvps', id), { status });
    return { ok: true };
  } catch (e) {
    console.error('[store] Cập nhật RSVP thất bại:', e);
    return { ok: false, error: e.message || 'Không thể cập nhật RSVP.' };
  }
}
