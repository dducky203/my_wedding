import blockedPhrases from '../data/wishBlockedPhrases.json' with { type: 'json' };

function normalizeKeepAccents(value) {
  return String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeRemoveAccents(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Allow punctuation between letters, e.g. v.c.l.
function buildPattern(cleanPhrase) {
  const compact = cleanPhrase.replace(/ /g, '');
  const chars = Array.from(compact).map((ch) =>
    ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  return new RegExp(`(?:^| )${chars.join(' *')}(?= |$)`, 'u');
}

// Match both spellings against text that still retains its accents:
// "lon" is blocked, but "lớn" must not become "lon" in this branch.
const exactPatterns = blockedPhrases.exactAccentPhrases.flatMap((phrase) =>
  [...new Set([normalizeKeepAccents(phrase), normalizeRemoveAccents(phrase)])]
    .map(buildPattern)
);
const normalizedPatterns = blockedPhrases.normalizedPhrases.map((phrase) =>
  buildPattern(normalizeRemoveAccents(phrase))
);

export function containsInappropriateLanguage(value) {
  const keepAccentsText = normalizeKeepAccents(value);
  if (exactPatterns.some((pattern) => pattern.test(keepAccentsText))) return true;
  const noAccentsText = normalizeRemoveAccents(value);
  return normalizedPatterns.some((pattern) => pattern.test(noAccentsText));
}

export function validateWish({ name, email = '', message }) {
  const cleanName = String(name ?? '').trim();
  const cleanEmail = String(email ?? '').trim();
  const cleanMessage = String(message ?? '').trim();
  if (!cleanName) return 'Vui lòng nhập họ tên của bạn.';
  if (cleanName.length > 100) return 'Họ tên không được quá 100 ký tự.';
  if (!cleanMessage) return 'Vui lòng viết lời chúc.';
  if (cleanMessage.length > 1000) return 'Lời chúc không được quá 1000 ký tự.';
  if (cleanEmail.length > 120 || (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) {
    return 'Email chưa đúng định dạng.';
  }
  if (containsInappropriateLanguage(cleanName) || containsInappropriateLanguage(cleanMessage)) {
    return 'Họ tên hoặc lời chúc có từ ngữ không phù hợp. Vui lòng dùng lời lẽ lịch sự trước khi gửi.';
  }
  return '';
}
