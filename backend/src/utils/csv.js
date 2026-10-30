import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

export function readCsv(dir, file) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  return parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true });
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = Array.isArray(v) ? v.join('|') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n');
}

export const blank = (v) => v === undefined || v === null || String(v).trim() === '';
