/**
 * common.jsx — Tiện ích dùng chung cho 2 trang công khai (PublicPage, RsvpPage).
 * Port từ site.js gốc: applyTheme, applySeo, showToast, nạp config qua
 * store.getConfig() + lắng nghe live preview từ Dashboard.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getConfig } from '../lib/store.js';
import { DEFAULT_CONFIG } from '../lib/defaultConfig.js';
import { coupleNames } from '../lib/utils.js';

/** Áp theme từ config lên CSS variables ở :root (như applyTheme bản gốc). */
export function applyTheme(cfg) {
  if (!cfg || !cfg.theme) return;
  const root = document.documentElement.style;
  const c = cfg.theme.colors || {};
  if (c.primary) root.setProperty('--color-primary', c.primary);
  if (c.secondary) root.setProperty('--color-secondary', c.secondary);
  if (c.background) root.setProperty('--color-background', c.background);
  if (c.text) root.setProperty('--color-text', c.text);
  const f = cfg.theme.fonts || {};
  if (f.heading) root.setProperty('--font-heading', `'${f.heading}', serif`);
  if (f.accent) root.setProperty('--font-accent', `'${f.accent}', cursive`);
  if (f.body) root.setProperty('--font-body', `'${f.body}', sans-serif`);
  const duration = { slow: 1200, normal: 800, fast: 450 }[cfg.theme.scrollSpeed] || 800;
  document.documentElement.style.setProperty('--reveal-duration', `${duration}ms`);
}

/** Cập nhật <title> + meta SEO từ config (như applySeo bản gốc). */
export function applySeo(cfg, isRsvpPage = false) {
  if (!cfg || !cfg.couple) return;
  const [first, second] = coupleNames(cfg);
  const names = `${first} & ${second}`;
  const setMeta = (selector, value) => {
    const el = document.querySelector(selector);
    if (el && value) el.setAttribute('content', value);
  };
  if (isRsvpPage) {
    document.title = `Xác Nhận Tham Dự — ${names}`;
    setMeta('meta[property="og:title"]', `Xác Nhận Tham Dự — ${names}`);
    setMeta('meta[name="twitter:title"]', `Xác Nhận Tham Dự — ${names}`);
  } else {
    document.title = (cfg.site && cfg.site.title) || `${names} — Thiệp Cưới Online`;
    if (cfg.site) {
      setMeta('meta[property="og:title"]', cfg.site.title);
      setMeta('meta[name="twitter:title"]', cfg.site.title);
    }
  }
  if (cfg.site) {
    setMeta('meta[name="description"]', cfg.site.metaDescription);
    setMeta('meta[property="og:description"]', cfg.site.metaDescription);
    setMeta('meta[name="twitter:description"]', cfg.site.metaDescription);
    setMeta('meta[property="og:image"]', cfg.site.ogImage);
    setMeta('meta[name="twitter:image"]', cfg.site.ogImage);
  }
}

/**
 * Hook nạp config: localStorage → config.json → mẫu (qua store.getConfig).
 * Áp theme + SEO khi có config; nạp lại khi Dashboard gửi
 * message { type: 'wedding-config-updated' } (live preview, không reload).
 */
export function useConfig(isRsvpPage = false) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      getConfig()
        .catch((err) => {
          console.error('[config] Không tải được cấu hình Firebase:', err);
          return DEFAULT_CONFIG;
        })
        .then((c) => {
          if (!alive) return;
          setCfg(c);
          applyTheme(c);
          applySeo(c, isRsvpPage);
        });
    };
    load();
    const onMessage = (e) => {
      if (e.data && e.data.type === 'wedding-config-updated') load();
    };
    window.addEventListener('message', onMessage);
    return () => {
      alive = false;
      window.removeEventListener('message', onMessage);
    };
  }, [isRsvpPage]);
  return cfg;
}

/** Hook toast: showToast(message) hiện 4 giây rồi tự ẩn (như bản gốc). */
export function useToast() {
  const [toast, setToast] = useState('');
  const timerRef = useRef(null);
  const showToast = useCallback((message) => {
    setToast(message || '');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(''), 4000);
  }, []);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  return { toast, showToast };
}

/** Khung toast dùng chung (id="toast", class="toast"). */
export function Toast({ message }) {
  return (
    <div id="toast" className="toast" role="status" aria-live="polite" hidden={!message}>
      {message}
    </div>
  );
}

/**
 * Fallback khi ảnh lỗi: đổi sang ảnh picsum theo seed (như bindImageFallback).
 * Gắn vào onError của <img>: onError={(e) => handleImgError(e, 'album-1')}.
 * Ảnh QR mừng cưới KHÔNG dùng fallback này (bản gốc gán data-fallback-done).
 */
export function handleImgError(e, seed) {
  const img = e.currentTarget;
  if (!img || img.dataset.fallbackDone) return;
  img.dataset.fallbackDone = '1';
  img.src = `https://picsum.photos/seed/${encodeURIComponent(seed || 'wedding-fallback')}/800/800`;
}
