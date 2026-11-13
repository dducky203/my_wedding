import test from 'node:test';
import assert from 'node:assert/strict';
import { containsInappropriateLanguage, validateWish } from './wishValidation.js';

test('blocks profanity with accents, case, punctuation and invisible characters', () => {
  for (const value of ['ĐỊT MẸ', 'dit me', 'v.c.l', 'f*u*c*k', 'đ\u200béo', 'đồ ngu', 'chia tay', 'CHIA TAY', 'tan nát', 'tan nat', 'ngoại tình', 'ngoai tinh']) {
    assert.equal(containsInappropriateLanguage(value), true, value);
  }
});

test('allows ordinary Vietnamese names and wedding greetings', () => {
  for (const value of ['Đỗ Đức Dũng', 'Phúc', 'Long', 'Chúc hai bạn trăm năm hạnh phúc!', 'Hạnh phúc ngập tràn, sớm có em bé nhé!']) {
    assert.equal(containsInappropriateLanguage(value), false, value);
  }
});

test('blocks added words with and without Vietnamese accents', () => {
  for (const value of ['chết', 'DIE', 'tai nạn', 'TAI NAN', 'phò', 'đĩ', 'cave', 'bú', 'đ.ĩ', 'tự sát', 'ly hôn', 'phan boi', 'wtf']) {
    assert.equal(containsInappropriateLanguage(value), true, value);
  }
});

test('allows accent lookalikes while blocking exact accented words', () => {
  for (const text of ['đi', 'ĐI', 'Mình sẽ đi nhé!', 'đi đi', 'đi'.normalize('NFD'), 'phố', 'phở', 'đầm', 'đám', 'bù', 'pho', 'bu', 'di', 'dam', 'xe dam', 'chet', 'đất', 'cút', 'cút lộn']) {
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
