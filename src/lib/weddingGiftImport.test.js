import test from 'node:test';
import assert from 'node:assert/strict';
import { readGiftSheet, buildGiftTable } from './weddingGiftImport.js';

test('preserves Excel formatting and row numbers without dropping empty cells', () => {
  const workbook = { Sheets: { Gifts: {
    '!ref': 'A1:C5',
    A1: { t: 's', v: 'Danh sách mừng cưới' },
    A2: { t: 's', v: 'Tên' }, B2: { t: 's', v: 'Số tiền' }, C2: { t: 's', v: 'Mã' },
    A3: { t: 's', v: 'Nguyễn An' }, B3: { t: 'n', v: 1000000, z: '#,##0' }, C3: { t: 'n', v: 12, z: '0000' },
    A5: { t: 's', v: 'Bình' }, B5: { t: 'n', v: 0 },
  } } };
  const table = buildGiftTable(readGiftSheet(workbook, 'Gifts'), 2);
  assert.deepEqual(table.columns, ['Tên', 'Số tiền', 'Mã']);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[0], { excelRow: 3, cells: ['Nguyễn An', '1,000,000', '0012'] });
  assert.deepEqual(table.rows[1], { excelRow: 5, cells: ['Bình', '0', ''] });
});

test('supports blank and duplicate headers without overwriting columns', () => {
  const table = buildGiftTable([['Tên', '', 'Tên'], ['A', '500000', 'B']], 1);
  assert.deepEqual(table.columns, ['Tên', 'Cột B', 'Tên']);
  assert.deepEqual(table.rows[0].cells, ['A', '500000', 'B']);
});

test('rejects invalid header rows and oversized sheets', () => {
  assert.throws(() => buildGiftTable([['Tên']], 0));
  assert.throws(() => buildGiftTable([['Tên']], 2));
  assert.throws(() => readGiftSheet({ Sheets: { Gifts: { '!ref': 'A1:C20000' } } }, 'Gifts'));
});
