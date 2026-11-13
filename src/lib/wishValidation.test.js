import test from 'node:test';
import assert from 'node:assert/strict';
import blockedPhrases from '../data/wishBlockedPhrases.json' with { type: 'json' };
import { containsInappropriateLanguage, validateWish } from './wishValidation.js';

test('blocks profanity with accents, case, punctuation and invisible characters', () => {
  for (const value of ['ĐỊT MẸ', 'dit me', 'v.c.l', 'f*u*c*k', 'đ\u200béo', 'đồ ngu', 'chia tay', 'CHIA TAY', 'tan nát', 'tan nat', 'ngoại tình', 'ngoai tinh']) {
    assert.equal(containsInappropriateLanguage(value), true, value);
  }
});

test('allows ordinary Vietnamese names and wedding greetings', () => {
  for (const value of ['Đỗ Đức Dũng', 'Phúc', 'Long', 'đi chơi', 'đầm ấm', 'thành phố', 'Hải Phòng', 'bù đắp', 'Chúc hai bạn trăm năm hạnh phúc!', 'Hạnh phúc ngập tràn, sớm có em bé nhé!']) {
    assert.equal(containsInappropriateLanguage(value), false, value);
  }
});

test('blocks added words with and without Vietnamese accents', () => {
  for (const value of ['chết', 'DIE', 'tai nạn', 'TAI NAN', 'phò', 'đĩ', 'cave', 'bú', 'đ.ĩ', 'địt', 'dit', 'tự sát', 'ly hôn', 'phan boi', 'wtf']) {
    assert.equal(containsInappropriateLanguage(value), true, value);
  }
});

test('allows accent lookalikes while blocking exact accented words', () => {
  for (const text of ['đi', 'ĐI', 'Mình sẽ đi nhé!', 'đi đi', 'đi'.normalize('NFD'), 'phố', 'phở', 'đầm', 'đám', 'bù', 'đất', 'cút', 'cút lộn']) {
    assert.equal(containsInappropriateLanguage(text), false, text);
  }
  for (const text of ['đĩ', 'đỉ', 'đi đĩ', 'đĩ'.normalize('NFD'), 'bú', 'dâm']) {
    assert.equal(containsInappropriateLanguage(text), true, text);
  }
});

test('preserves the previous blocked vocabulary and adds explicit insults and threats', () => {
  const oldWords = [
    'chia tay', 'tan nát', 'ngoại tình', 'chết', 'die', 'tai nạn', 'xe đâm', 'đâm',
    'phò', 'đĩ', 'cave', 'bú', 'địt', 'đụ', 'đéo', 'đếch', 'lồn', 'cặc', 'buồi',
    'đụ má', 'đụ mẹ', 'địt mẹ', 'địt má', 'con đĩ', 'chó đẻ',
    'đồ ngu', 'óc chó', 'súc vật', 'khốn nạn', 'mất dạy',
    'vcl', 'vl', 'vkl', 'đm', 'đmm', 'dcm', 'dmm', 'cdmm', 'clm', 'dm', 'dkm', 'cl',
    'fuck', 'fucking', 'shit', 'bitch', 'asshole',
  ];
  for (const value of [...oldWords, 'đít', 'cứt', 'đái', 'ngu dốt', 'đồ khốn', 'nghịch súc', 'tao giết', 'câm mồm', 'GIET MAY', 'c.â.m m.ồ.m']) {
    assert.equal(containsInappropriateLanguage(value), true, value);
  }
});

test('blocks requested abbreviations and collision words in names and messages', () => {
  for (const value of ['clm', 'dcm', 'dmm', 'cdmm', 'xe đâm', 'đâm chém', 'đâm chết', 'CLM', 'c.d.m.m']) {
    assert.ok(validateWish({ name: 'Minh', message: `Lời chúc ${value}!` }), value);
    assert.ok(validateWish({ name: value, message: 'Chúc hai bạn hạnh phúc!' }), value);
  }
  assert.equal(containsInappropriateLanguage('Adam'), false);
});

test('validates name, message, email and field lengths', () => {
  const wish = { name: 'Minh', message: 'Chúc hai bạn hạnh phúc!' };
  assert.equal(validateWish(wish), '');
  for (const change of [{ name: ' ' }, { message: '' }, { name: 'đồ ngu' }, { message: 'vcl' }, { email: 'invalid' }, { name: 'a'.repeat(101) }, { message: 'a'.repeat(1001) }]) {
    assert.ok(validateWish({ ...wish, ...change }));
  }
});

test('blocks every configured phrase with case, punctuation and invisible-character variants', () => {
  for (const phrase of [...blockedPhrases.exactAccentPhrases, ...blockedPhrases.normalizedPhrases]) {
    for (const value of [phrase, phrase.toUpperCase(), phrase.normalize('NFD'), Array.from(phrase).join('.'), Array.from(phrase).join('\u200b')]) {
      assert.equal(containsInappropriateLanguage(value), true, value);
    }
  }
});

test('blocks additional unaccented profanity and explicit insults in either input field', () => {
  for (const value of ['deo', 'dech', 'nung', 'vãi cặc', 'vai cac', 'vai dai', 'vai buoi', 'ăn lồn', 'an lon', 'an cac', 'an buoi', 'ăn cứt', 'an cut', 'nhu lon', 'nhu cac', 'nhu cut', 'ham lon', 'mat lon', 'mat cac', 'con pho', 'thằng ngu', 'con ngu', 'do mat day', 'đồ bệnh hoạn', 'dam chem', 'dam chet', 'tu sat', 'DIT', 'DỊT', 'd.i.t']) {
    assert.ok(validateWish({ name: 'Minh', message: value }), value);
    assert.ok(validateWish({ name: value, message: 'Chúc hai bạn hạnh phúc!' }), value);
  }
});

test('keeps accent collisions, ordinary names and unaccented greetings valid', () => {
  for (const value of ['Các bạn có một ngày vui lớn!', 'Buổi lễ thật đầm ấm', 'Đủ đầy yêu thương', 'Đại Vũ', 'Hiệp', 'Diễm', 'Duy', 'Đỗ Đức Dũng', 'Hải Phòng', 'đi chơi', 'bù đắp', 'Chuc hai ban hanh phuc', 'Chuc hai ban tram nam hanh phuc', 'Phúc Long', 'Adam', 'Scunthorpe', 'classic', 'assembly']) {
    assert.equal(validateWish({ name: 'Minh', message: value }), '', value);
    assert.equal(validateWish({ name: value, message: 'Chúc hai bạn hạnh phúc!' }), '', value);
  }
});

test('blocks accentless spellings without rejecting legitimate accented words', () => {
  for (const phrase of blockedPhrases.exactAccentPhrases) {
    const plain = phrase.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
    for (const value of [plain, plain.toUpperCase(), Array.from(plain).join('.'), Array.from(plain).join('\u200b')]) {
      assert.ok(validateWish({ name: 'Minh', message: value }), value);
      assert.ok(validateWish({ name: value, message: 'Chúc hai bạn hạnh phúc!' }), value);
    }
  }
  for (const value of ['lớn', 'đi', 'buổi', 'các', 'lớn , đi , buổi , các ,', 'LỚN', 'BUỔI', 'CÁC', 'lớn lên', 'các bạn', 'buổi tối', 'ĐI', 'LỚN LÊN', 'CÁC BẠN', 'BUỔI TỐI', 'Chúc các bạn có buổi tối vui vẻ, cùng nhau lớn lên']) {
    assert.equal(containsInappropriateLanguage(value), false, value);
    assert.equal(containsInappropriateLanguage(value.normalize('NFD')), false, value);
  }
  for (const value of ['đi chơi di', 'các bạn cac', 'buổi tối buoi', 'lớn lên lon']) {
    assert.equal(containsInappropriateLanguage(value), true, value);
  }
});
