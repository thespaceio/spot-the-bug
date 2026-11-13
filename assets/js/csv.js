// CSV export for reports (team admin, class results). Values that a spreadsheet
// would treat as a formula are prefixed with ' so a player's name can't run one.

const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** rows: an array of arrays (the first is the header row). */
export const toCsv = (rows) => `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

/** Saves rows as a .csv file (with a BOM so Excel reads the naira sign and names correctly). */
export function downloadCsv(fileName, rows) {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A safe file name part: "Acme Bank" → "acme-bank". */
export const slugPart = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'report';
