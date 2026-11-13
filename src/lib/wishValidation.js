// Match whole words/phrases so ordinary names and greetings stay valid.
const BLOCKED_PHRASES = [
  'chia tay', 'tan nát', 'ngoại tình',
  'chết', 'die', 'tai nạn', 'phò', 'đĩ', 'cave', 'bú',
  'địt', 'đụ', 'đéo', 'đếch', 'lồn', 'cặc', 'buồi',
  'đụ má', 'đụ mẹ', 'địt mẹ', 'địt má', 'con đĩ', 'chó đẻ',
  'đồ ngu', 'óc chó', 'súc vật', 'khốn nạn', 'mất dạy',
  'vcl', 'vl', 'vkl', 'đm', 'đmm', 'dcm', 'dm', 'dkm', 'cl',
  'fuck', 'fucking', 'shit', 'bitch', 'asshole',
];

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Permit punctuation between letters, e.g. "v.c.l" or "f*u*c*k".
const blockedPatterns = BLOCKED_PHRASES.map((phrase) => {
  const letters = normalizeText(phrase).replace(/ /g, '');
  return new RegExp(`(?:^| )${letters.split('').join(' *')}(?= |$)`);
});

export function containsInappropriateLanguage(value) {
  // Preserve the ordinary verb "đi" before removing accents ("đĩ" also folds to "di").
  const text = String(value ?? '').normalize('NFC').toLowerCase()
    .replace(/(^|[^\p{L}\p{N}])đi(?=$|[^\p{L}\p{N}])/gu, '$1allowedword');
  const normalized = normalizeText(text);
  return blockedPatterns.some((pattern) => pattern.test(normalized));
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
