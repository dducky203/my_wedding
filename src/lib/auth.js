/**
 * auth.js — Xác thực quản trị (chỉ frontend, không backend).
 * Port từ admin/login.html gốc:
 * - Mật khẩu lưu dạng băm SHA-256 trong localStorage khóa `wedding_admin_hash`.
 * - Phiên đăng nhập lưu ở sessionStorage khóa `wedding_admin_session = "1"`.
 * - Mọi truy cập storage đều bọc try/catch + bộ nhớ đệm dự phòng (trong iframe
 *   bị sandbox, đọc/ghi storage có thể NÉM LỖI và làm chết cả trang).
 * - Đây chỉ là khóa giao diện, chưa phải bảo mật thật (không có backend).
 */

import { STORAGE_KEYS } from './store.js';
import { sha256Hex } from './sha256.js';

// Bộ nhớ đệm dự phòng khi storage bị chặn.
const memStore = {};

export function storageGet(storage, key) {
  try {
    const v = storage.getItem(key);
    return v == null ? null : v;
  } catch (e) {
    return Object.prototype.hasOwnProperty.call(memStore, key) ? memStore[key] : null;
  }
}

export function storageSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (e) {
    memStore[key] = value;
  }
}

export function storageRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch (e) {
    delete memStore[key];
  }
}

/** Đã đặt mật khẩu quản trị chưa? */
export function hasAdminPassword() {
  return !!storageGet(localStorage, STORAGE_KEYS.adminHash);
}

/** Kiểm tra mật khẩu nhập vào có khớp hash đã lưu không. */
export async function checkAdminPassword(password) {
  const hash = await sha256Hex(password);
  return hash === storageGet(localStorage, STORAGE_KEYS.adminHash);
}

/** Đặt mật khẩu quản trị lần đầu (trả về { ok, error? }). */
export async function setAdminPassword(p1, p2) {
  if (!p1 || p1.length < 6) return { ok: false, error: 'Mật khẩu tối thiểu 6 ký tự.' };
  if (p1 !== p2) return { ok: false, error: 'Hai mật khẩu nhập lại không khớp.' };
  try {
    const hash = await sha256Hex(p1);
    storageSet(localStorage, STORAGE_KEYS.adminHash, hash);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Có lỗi khi lưu mật khẩu. Vui lòng thử lại.' };
  }
}

/** Đã đăng nhập (còn phiên) chưa? */
export function isAdminLoggedIn() {
  return storageGet(sessionStorage, STORAGE_KEYS.adminSession) === '1';
}

/** Ghi phiên đăng nhập. */
export function markAdminLoggedIn() {
  storageSet(sessionStorage, STORAGE_KEYS.adminSession, '1');
}

/** Đăng xuất (xóa phiên). */
export function logoutAdmin() {
  storageRemove(sessionStorage, STORAGE_KEYS.adminSession);
}
