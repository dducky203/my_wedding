/**
 * qr.js — Sinh mã QR mừng cưới dạng SVG nội tuyến.
 * Port từ site.js gốc (fillGiftQrCodes): dùng thư viện qrcode-generator
 * (public/js/qrcode-generator.js, nạp bằng thẻ <script> trong index.html
 * nên có sẵn ở window.qrcode). Nếu đã có ảnh QR (data: hoặc http) thì
 * dùng ảnh đó thay vì sinh mã.
 */

import { stripQrDiacritics } from './utils.js';

/**
 * Trả về chuỗi SVG của mã QR cho một tài khoản, hoặc null nếu không sinh được.
 * payload gồm 3 dòng: ngân hàng, số tài khoản, chủ tài khoản (bỏ dấu).
 */
export function makeGiftQrSvg({ bank, accountNumber, accountName }) {
  try {
    if (typeof window === 'undefined' || typeof window.qrcode !== 'function') return null;
    if (!accountNumber) return null;
    const payload = [
      `Ngan hang: ${stripQrDiacritics(bank)}`,
      `So tai khoan: ${accountNumber}`,
      `Chu tai khoan: ${stripQrDiacritics(accountName)}`,
    ].join('\n');
    const qr = window.qrcode(0, 'M');
    qr.addData(payload);
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 20, scalable: true });
  } catch (e) {
    return null;
  }
}

/** Ảnh QR có phải URL dùng được không (data: hoặc http(s):)? */
export function isUsableQrImage(img) {
  return /^(data:|https?:)/i.test(String(img || ''));
}
