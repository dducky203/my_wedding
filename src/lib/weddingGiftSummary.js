export const GIFT_PAGE_SIZE = 15;
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase().trim().replace(/\s+/g, ' ');

/** Amounts are VND; k/nghìn/ngàn and tr/triệu explicitly scale the value. */
export function parseGiftAmount(value) {
  let text = normalize(value).replace(/(?:vnd|vnđ|dong|đ|₫)/g, '').trim();
  if (!text) return null;
  const unit = text.match(/(trieu|tr|nghin|ngan|k)$/);
  const multiplier = unit ? (/^(trieu|tr)$/.test(unit[1]) ? 1000000 : 1000) : 1;
  if (unit) text = text.slice(0, -unit[1].length).trim();
  text = text.replace(/\s/g, '');
  if (!/^\d+(?:[.,]\d+)*$/.test(text)) return null;
  if (unit && /^\d+[.,]\d+$/.test(text)) text = text.replace(',', '.');
  else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(text)) text = text.replace(/[.,]/g, '');
  else if (/^\d+[.,]0{1,2}$/.test(text)) text = text.replace(',', '.');
  else if (!/^\d+$/.test(text)) return null;
  const result = Number(text) * multiplier;
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

export function summarizeGiftTable(table) {
  const columns = (table?.columns || []).map(normalize);
  const indexes = {
    name: columns.findIndex((name) => ['ten', 'ho ten', 'ho va ten'].includes(name)),
    amount: columns.findIndex((name) => ['so tien mung', 'so tien', 'tien mung'].includes(name)),
    groom: columns.indexOf('nha trai'), bride: columns.indexOf('nha gai'),
  };
  const missing = Object.entries(indexes).filter(([, index]) => index < 0).map(([key]) => ({ name: 'Tên', amount: 'Số tiền mừng', groom: 'Nhà trai', bride: 'Nhà gái' })[key]);
  const summary = { missing, entries: [], total: 0, groom: 0, bride: 0, unassigned: 0, invalid: [], ambiguous: [] };
  if (missing.length) return summary;
  const marked = (value) => ['x', '✓', '✔', 'true', '1', 'co', 'yes'].includes(normalize(value));
  for (const row of table?.rows || []) {
    const name = row.cells[indexes.name]?.trim() || '';
    const rawAmount = row.cells[indexes.amount] || '';
    const groom = marked(row.cells[indexes.groom]), bride = marked(row.cells[indexes.bride]);
    if (!name && !rawAmount.trim() && !groom && !bride) continue;
    const amount = parseGiftAmount(rawAmount);
    const entry = { ...row, name, rawAmount, amount, groom, bride };
    summary.entries.push(entry);
    if (amount === null || !name) { summary.invalid.push(row.excelRow); continue; }
    summary.total += amount;
    if (groom && !bride) summary.groom += amount;
    else if (bride && !groom) summary.bride += amount;
    else { summary.unassigned += amount; summary.ambiguous.push(row.excelRow); }
  }
  return summary;
}
