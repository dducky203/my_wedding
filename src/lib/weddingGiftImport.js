import { utils } from 'xlsx';

export function readGiftSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet?.['!ref']) return [];
  const range = utils.decode_range(sheet['!ref']);
  if (range.e.r >= 10001 || range.e.c >= 100) throw new Error('Mỗi sheet hỗ trợ tối đa 10.000 dòng dữ liệu và 100 cột.');
  return utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true, range: 0 });
}

export function buildGiftTable(matrix, headerRow) {
  const start = Number(headerRow) - 1;
  if (!Number.isInteger(start) || start < 0 || start >= matrix.length) throw new Error('Dòng tiêu đề không hợp lệ.');
  const width = Math.max(...matrix.slice(start).map((row) => row.length), 0);
  const columns = Array.from({ length: width }, (_, index) => String(matrix[start][index] ?? '').trim() || `Cột ${utils.encode_col(index)}`);
  const rows = matrix.slice(start + 1).map((row, index) => ({
    excelRow: start + index + 2,
    cells: columns.map((_, column) => String(row[column] ?? '')),
  })).filter((row) => row.cells.some((cell) => cell.trim()));
  return { columns, rows };
}
