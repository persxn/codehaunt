/**
 * Extract code blocks from a model reply.
 *
 * Returns the last block matching the requested language's fence tags, or the last
 * untagged block if none match. Empty blocks are ignored. The source is trimmed
 * of trailing whitespace and terminated with a single "\n". If the source exceeds
 * {@link MAX_SOURCE_BYTES} the extraction fails with reason "too_large".
 */
import { MAX_SOURCE_BYTES, type Language } from '@codehaunt/contracts';
import { LANGUAGES } from './language.ts';

export type Extraction = { ok: true; source: string } | { ok: false; reason: 'no_code' | 'too_large' };

/**
 * Extract the last code block that matches `language` from `reply`.
 * @param reply The raw model reply.
 * @param language Desired language.
 */
export function extractCode(reply: string, language: Language): Extraction {
  // Normalise line endings.
  const normalized = reply.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  interface Block {
    tag: string;
    source: string;
  }

  const blocks: Block[] = [];
  const languageFences = new Set(LANGUAGES[language].fences.map((s) => s.toLowerCase()));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue; // Guard for noUncheckedIndexedAccess
    const openMatch = line.match(/^ {0,3}([`~]{3,})(.*)$/);
    if (!openMatch) continue;

    const fence = openMatch[1] ?? '';
    const fenceChar = fence[0] ?? '';
    const fenceLength = fence.length;
    const info = (openMatch[2] ?? '').trim();
    const firstWord = (info.split(/\s+/)[0] ?? '');
    const tag = firstWord ? firstWord.toLowerCase() : '';

    // Find the closing fence.
    let closingIdx: number | null = null;
    for (let j = i + 1; j < lines.length; j++) {
      const closeLine = lines[j];
      if (closeLine === undefined) continue; // Guard for noUncheckedIndexedAccess
      const closeMatch = closeLine.match(/^ {0,3}([`~]+)\s*$/);
      if (!closeMatch) continue;
      const closeFence = closeMatch[1] ?? '';
      if (closeFence[0] === fenceChar && closeFence.length >= fenceLength) {
        closingIdx = j;
        break;
      }
    }

    const bodyLines = closingIdx !== null ? lines.slice(i + 1, closingIdx) : lines.slice(i + 1);
    // Join body and trim trailing whitespace (including newlines).
    let body = bodyLines.join('\n');
    body = body.replace(/[ \t\r\n]+$/g, '');
    // Skip empty bodies.
    if (body === '') {
      // Advance i to after the closing fence if present to avoid nested detection.
      i = closingIdx !== null ? closingIdx : lines.length;
      continue;
    }
    const source = body + '\n';
    blocks.push({ tag, source });
    // Advance i to after the closing fence if present.
    i = closingIdx !== null ? closingIdx : lines.length - 1;
  }

  // The last block tagged with the language, else the last untagged one; other languages never count.
  const chosen = blocks.findLast((b) => languageFences.has(b.tag)) ?? blocks.findLast((b) => b.tag === '');
  if (chosen) {
    return Buffer.byteLength(chosen.source, 'utf8') > MAX_SOURCE_BYTES ? { ok: false, reason: 'too_large' } : { ok: true, source: chosen.source };
  }
  return { ok: false, reason: 'no_code' };
}
