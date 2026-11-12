/**
 * sha256.js — Băm SHA-256 (Web Crypto, dự phòng bản thuần JS).
 * Port từ admin/login.html gốc. Dùng để băm mật khẩu quản trị.
 */

/** SHA-256 thuần JS (dự phòng khi Web Crypto bị chặn). */
function sha256Sync(input) {
  var ascii = unescape(encodeURIComponent(input));
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  var maxWord = Math.pow(2, 32);
  var result = '';
  var words = [];
  var asciiBitLength = ascii.length * 8;
  var hash = sha256Sync.h = sha256Sync.h || [];
  var k = sha256Sync.k = sha256Sync.k || [];
  var primeCounter = k.length;
  var isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (var i = 0; i < 313; i += candidate) { isComposite[i] = candidate; }
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (var n = 0; n < ascii.length; n++) {
    words[n >> 2] |= ascii.charCodeAt(n) << ((3 - n) % 4) * 8;
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (var j = 0; j < words.length;) {
    var w = words.slice(j, j += 16);
    var oldHash = hash;
    hash = hash.slice(0, 8);
    for (var t = 0; t < 64; t++) {
      var w15 = w[t - 15], w2 = w[t - 2];
      var a = hash[0], e = hash[4];
      var temp1 = hash[7]
        + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
        + ((e & hash[5]) ^ (~e & hash[6]))
        + k[t]
        + (w[t] = (t < 16) ? w[t] : (
            w[t - 16]
            + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
            + w[t - 7]
            + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))
          ) | 0);
      var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (var u = 0; u < 8; u++) { hash[u] = (hash[u] + oldHash[u]) | 0; }
  }
  for (var p = 0; p < 8; p++) {
    for (var q = 3; q + 1; q--) {
      var b = (hash[p] >> (q * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/** Băm SHA-256 một chuỗi → hex. Ưu tiên Web Crypto, lỗi thì dùng bản JS. */
/** Băm SHA-256 một chuỗi → hex. Ưu tiên Web Crypto, lỗi thì dùng bản JS. */
export async function sha256Hex(text) {
  try {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      var data = new TextEncoder().encode(text);
      var buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
  } catch (e) { /* rơi xuống bản thuần JS bên dưới */ }
  return sha256Sync(text);
}
