/**
 * Participant CSV (RFC 4180-ish): header row required; columns name, enrolment (or enrolmentNo / enrolment number /
 * enrollment), email, phone in any order, case-insensitive; quoted fields with "" escapes; CRLF or LF.
 */
import type { ParticipantRow } from '@codehaunt/contracts';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const COLUMNS: Record<string, keyof ParticipantRow> = {
  name: 'name', 'full name': 'name',
  enrolment: 'enrolmentNo', enrolmentno: 'enrolmentNo', 'enrolment number': 'enrolmentNo', 'enrolment no': 'enrolmentNo',
  enrollment: 'enrolmentNo', 'enrollment number': 'enrolmentNo', 'enrollment no': 'enrolmentNo',
  email: 'email', 'e-mail': 'email', phone: 'phone', mobile: 'phone', 'phone number': 'phone',
};

export type ParsedRow = { line: number; row: ParticipantRow | null; error: string | null };

/** Rows with a per-line error (shown in the preview); only rows without errors are sent. */
export function participantsFromCsv(text: string): { rows: ParsedRow[]; error: string | null } {
  const [header, ...lines] = parseCsv(text.replace(/^﻿/, ''));
  if (!header) return { rows: [], error: 'The file is empty.' };
  const keys = header.map((h) => COLUMNS[h.trim().toLowerCase()] ?? null);
  if (!keys.includes('name') || !keys.includes('enrolmentNo')) {
    return { rows: [], error: 'The first row must name the columns, including "name" and "enrolment".' };
  }
  return {
    error: null,
    rows: lines.map((cells, i) => {
      const record: Record<string, string> = {};
      keys.forEach((k, j) => { if (k && cells[j]?.trim()) record[k] = cells[j]!.trim(); });
      const problems: string[] = [];
      if (!record.name) problems.push('name missing');
      if (!record.enrolmentNo) problems.push('enrolment missing');
      else if (!/^[A-Za-z0-9/_-]{1,40}$/.test(record.enrolmentNo)) problems.push('enrolment: letters, digits, / _ - only');
      if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) problems.push('email looks wrong');
      if (record.phone && !/^[0-9+ -]{6,20}$/.test(record.phone)) problems.push('phone looks wrong');
      return { line: i + 2, row: problems.length ? null : (record as ParticipantRow), error: problems.join('; ') || null };
    }),
  };
}
