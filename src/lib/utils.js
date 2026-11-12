/**
 * utils.js — Hàm tiện ích dùng chung (port từ site.js/admin.js gốc).
 */

export function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function stripQrDiacritics(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function parseYoutubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function toCalStamp(date, time, addHours = 0) {
  const d = new Date(`${date}T${time || '09:00'}:00`);
  d.setHours(d.getHours() + addHours);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

export function googleCalendarUrl(ev, cfg) {
  const [first, second] = coupleNames(cfg);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${ev.name} — Lễ cưới ${first} & ${second}`,
    dates: `${toCalStamp(ev.date, ev.time)}/${toCalStamp(ev.date, ev.time, 2)}`,
    details: ev.note || '',
    location: `${ev.venue}, ${ev.address}`,
    ctz: 'Asia/Ho_Chi_Minh'
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function icsEscape(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function downloadIcs(ev, cfg) {
  const [first, second] = coupleNames(cfg);
  const uidStamp = `${Date.now()}@wedding-invitation`;
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wedding Invitation//EN',
    'BEGIN:VEVENT',
    `UID:${uidStamp}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toCalStamp(ev.date, ev.time)}`,
    `DTEND:${toCalStamp(ev.date, ev.time, 2)}`,
    `SUMMARY:${icsEscape(`${ev.name} — Lễ cưới ${first} & ${second}`)}`,
    `DESCRIPTION:${icsEscape(ev.note || '')}`,
    `LOCATION:${icsEscape(`${ev.venue}, ${ev.address}`)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ev.name.replace(/\s+/g, '-').toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function coupleNames(cfg) {
  const { groom, bride, order } = cfg.couple;
  return order === 'brideFirst' ? [bride.name, groom.name] : [groom.name, bride.name];
}

