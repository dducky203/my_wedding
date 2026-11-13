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
  for (const value of ['chết', 'chet', 'DIE', 'tai nạn', 'TAI NAN', 'phò', 'pho', 'đĩ', 'di', 'cave', 'bú', 'bu']) {
    assert.equal(containsInappropriateLanguage(value), true, value);
  }
});

test('allows đi while still blocking đĩ and unaccented di', () => {
  for (const text of ['đi', 'ĐI', 'Mình sẽ đi nhé!', 'đi đi', 'đi'.normalize('NFD')]) {
    assert.equal(containsInappropriateLanguage(text), false, text);
  }
  for (const text of ['đĩ', 'di', 'đi đĩ', 'đi di']) {
    assert.equal(containsInappropriateLanguage(text), true, text);
  }
});

test('validates name, message, email and field lengths', () => {
  const wish = { name: 'Minh', message: 'Chúc hai bạn hạnh phúc!' };
  assert.equal(validateWish(wish), '');
  for (const change of [{ name: ' ' }, { message: '' }, { name: 'đồ ngu' }, { message: 'vcl' }, { email: 'invalid' }, { name: 'a'.repeat(101) }, { message: 'a'.repeat(1001) }]) {
    assert.ok(validateWish({ ...wish, ...change }));
  }
});
