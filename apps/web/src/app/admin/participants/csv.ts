/**
 * Participant CSV, strict (ADR-044). The format:
 *
 *   enrolment,name,email,phone
 *   2023CS001,Asha Roy,asha@example.org,+91 98300 00000
 *
 * - The first row names the columns, in any order, case-insensitive. `enrolment` and `name` are required; `email` and
 *   `phone` are optional (the column may be missing or the cell empty). Accepted spellings are listed in COLUMNS;
 *   any other column name is an error, so a typo can't silently drop data.
 * - RFC 4180 quoting ("a, b" and "" escapes); CRLF or LF; a UTF-8 BOM is ignored. At most 1 MB and 1,000 rows.
 * - Blank lines are ignored and counted. A row with more values than columns is an error for that row.
 * The browser checks the file's shape; the server (dry run) checks every value again plus duplicates and accounts.
 */
// Same as IMPORT_MAX_ROWS in @codehaunt/contracts (kept local: no zod in the browser bundle for one number).
const IMPORT_MAX_ROWS = 1000;

export const MAX_CSV_BYTES = 1024 * 1024;
export const TEMPLATE = 'enrolment,name,email,phone\r\n2023CS001,Asha Roy,asha@example.org,+91 98300 00000\r\n2023CS002,Rahul Sen,,\r\n';

export type Column = 'enrolment' | 'name' | 'email' | 'phone';
const COLUMNS: Record<string, Column> = {
  enrolment: 'enrolment', enrolmentno: 'enrolment', 'enrolment no': 'enrolment', 'enrolment number': 'enrolment',
  enrollment: 'enrolment', enrollmentno: 'enrolment', 'enrollment no': 'enrolment', 'enrollment number': 'enrolment',
  name: 'name', 'full name': 'name',
  email: 'email', 'e-mail': 'email',
  phone: 'phone', mobile: 'phone', 'phone number': 'phone',
};

export interface CsvRow {
  line: number;
  name: string;
  enrolmentNo: string;
  email?: string;
  phone?: string;
}
export interface RowIssue { line: number; column: Column | null; message: string }
export interface ParsedCsv {
  /** A problem with the whole file: nothing can be imported until it is fixed. */
  error: string | null;
  rows: CsvRow[];
  issues: RowIssue[];
  blankLines: number;
}

/** Cells per record, with the line each record starts on. Throws on an unclosed quote. */
export function parseCsv(text: string): Array<{ line: number; cells: string[] }> {
  const out: Array<{ line: number; cells: string[] }> = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  const endRow = () => {
    row.push(field);
    field = '';
    out.push({ line: start, cells: row });
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else {
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      start = line;
    } else field += c;
  }
  if (quoted) throw new Error(`A quoted value that starts on line ${start} is never closed. Check the quotes on that line.`);
  if (field !== '' || row.length) endRow();
  return out;
}

export function participantsFromCsv(text: string, bytes = text.length): ParsedCsv {
  const fail = (error: string): ParsedCsv => ({ error, rows: [], issues: [], blankLines: 0 });
  if (bytes > MAX_CSV_BYTES) return fail('The file is larger than 1 MB. Split it into smaller files.');
  if (/\u0000/.test(text)) return fail('This is not a text CSV file. Save it as "CSV UTF-8" and try again.');
  let records: Array<{ line: number; cells: string[] }>;
  try {
    records = parseCsv(text.replace(/^﻿/, ''));
  } catch (e) {
    return fail((e as Error).message);
  }
  const isBlank = (cells: string[]) => cells.every((c) => !c.trim());
  const firstIndex = records.findIndex((r) => !isBlank(r.cells));
  if (firstIndex === -1) return fail('The file is empty. Download the template and fill it in.');
  const header = records[firstIndex]!.cells.map((h) => h.trim().toLowerCase());
  const keys = header.map((h) => COLUMNS[h] ?? null);
  const unknown = header.filter((h, i) => h && !keys[i]);
  if (unknown.length) {
    return fail(`Unknown column ${unknown.map((u) => `"${u}"`).join(', ')}. Use only: enrolment, name, email, phone (first row).`);
  }
  const dup = keys.find((k, i) => k && keys.indexOf(k) !== i);
  if (dup) return fail(`The column "${dup}" appears twice in the first row.`);
  const missing = (['enrolment', 'name'] as const).filter((k) => !keys.includes(k));
  if (missing.length) return fail(`The first row must name the columns; missing: ${missing.join(', ')}. Download the template to see the format.`);

  const body = records.slice(firstIndex + 1);
  const blankLines = body.filter((r) => isBlank(r.cells)).length;
  const data = body.filter((r) => !isBlank(r.cells));
  if (!data.length) return fail('The file has the column row but no participants.');
  if (data.length > IMPORT_MAX_ROWS) return fail(`The file has ${data.length} rows; at most ${IMPORT_MAX_ROWS} per import. Split it.`);

  const rows: CsvRow[] = [];
  const issues: RowIssue[] = [];
  for (const { line, cells } of data) {
    const width = keys.length;
    if (cells.length > width && cells.slice(width).some((c) => c.trim())) {
      issues.push({ line, column: null, message: `This row has ${cells.length} values but there are ${width} columns. Check for an unquoted comma.` });
      continue;
    }
    const get = (k: Column) => {
      const i = keys.indexOf(k);
      return i === -1 ? '' : (cells[i] ?? '').trim();
    };
    const row: CsvRow = { line, name: get('name'), enrolmentNo: get('enrolment') };
    if (get('email')) row.email = get('email');
    if (get('phone')) row.phone = get('phone');
    // The quick checks here; the server repeats them and adds the ones that need the database.
    if (!row.enrolmentNo) issues.push({ line, column: 'enrolment', message: 'Enrolment number is missing.' });
    else if (!/^[A-Za-z0-9/_-]{1,40}$/.test(row.enrolmentNo)) issues.push({ line, column: 'enrolment', message: 'Enrolment number may use only letters, digits, / _ - (at most 40).' });
    if (!row.name) issues.push({ line, column: 'name', message: 'Name is missing.' });
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) issues.push({ line, column: 'email', message: 'Not a valid email address (or leave it empty).' });
    if (row.phone && !/^[0-9+ -]{6,20}$/.test(row.phone)) issues.push({ line, column: 'phone', message: 'Phone must be 6–20 digits (spaces, + and - allowed), or empty.' });
    rows.push(row);
  }
  return { error: null, rows, issues, blankLines };
}
