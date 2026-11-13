import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { read } from 'xlsx';
import { readGiftSheet, buildGiftTable } from './weddingGiftImport.js';
import { parseGiftAmount, summarizeGiftTable, GIFT_PAGE_SIZE } from './weddingGiftSummary.js';

test('converts explicit Vietnamese currency values without silently guessing invalid values', () => {
  for (const [value, amount] of [['500k', 500000], ['3 triệu', 3000000], ['1,5 triệu', 1500000], ['500.000 ₫', 500000], ['1,000,000 VND', 1000000], ['500000', 500000], ['0', 0]]) {
    assert.equal(parseGiftAmount(value), amount, value);
  }
  for (const value of ['', 'abc', '-500k', '1tr5', '1.23.456']) assert.equal(parseGiftAmount(value), null, value);
});

test('reads supplied template and totals both sides without counting a shared mark twice', () => {
  const workbook = read(readFileSync(new URL('../../public/templates/ds-mung_cuoi.xlsx', import.meta.url)));
  const matrix = readGiftSheet(workbook, workbook.SheetNames[0]);
  const header = matrix.findIndex((row) => row.some((cell) => cell === 'Tên'));
  const columns = buildGiftTable(matrix, header + 1).columns;
  const row = (excelRow, name, amount, groom, bride) => ({ excelRow, cells: columns.map((column) => ({ 'Tên': name, 'Số tiền mừng': amount, 'Nhà trai': groom, 'Nhà gái': bride })[column] || '') });
  const summary = summarizeGiftTable({ columns, rows: [row(3, 'Abc', '500k', 'x', ''), row(4, 'xyz', '3 triệu', '', 'x'), row(5, 'C', '1 triệu', 'x', 'x'), row(6, 'D', 'sai', '', '')] });
  assert.deepEqual(summary.missing, []);
  assert.equal(summary.total, 4500000);
  assert.equal(summary.groom, 500000);
  assert.equal(summary.bride, 3000000);
  assert.equal(summary.unassigned, 1000000);
  assert.deepEqual(summary.invalid, [6]);
  assert.deepEqual(summary.ambiguous, [5]);
  assert.equal(GIFT_PAGE_SIZE, 15);
});
