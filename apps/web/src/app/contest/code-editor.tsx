'use client';
/**
 * The participant's code editor (ADR-033): they type every line. A transparent textarea lies over highlight.js
 * output, so the caret and selection are native and the colours come from hljs (which escapes the source: the only
 * HTML injected). Paste, drop, copy, cut, drag and the context menu do nothing; SEB's clipboard is off as well.
 * Tab indents four spaces; Enter keeps the current line's indentation.
 */
import hljs from 'highlight.js/lib/core';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';
import python from 'highlight.js/lib/languages/python';
import { useMemo } from 'react';

import type { Language } from '@codehaunt/contracts';

import styles from './contest.module.css';

hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('java', java);
hljs.registerLanguage('python', python);

const BLOCKED_INPUT = new Set(['insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop', 'insertFromYank', 'insertReplacementText']);

/** Handlers that stop every clipboard and drag path on an element. */
export const noClipboard = {
  onPaste: (e: React.SyntheticEvent) => e.preventDefault(),
  onDrop: (e: React.SyntheticEvent) => e.preventDefault(),
  onCopy: (e: React.SyntheticEvent) => e.preventDefault(),
  onCut: (e: React.SyntheticEvent) => e.preventDefault(),
  onDragStart: (e: React.SyntheticEvent) => e.preventDefault(),
  onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(),
  onBeforeInput: (e: React.FormEvent) => {
    if (BLOCKED_INPUT.has((e.nativeEvent as InputEvent).inputType)) e.preventDefault();
  },
};

function insert(area: HTMLTextAreaElement, text: string, onChange: (value: string) => void) {
  // execCommand keeps the browser's undo history; setRangeText is the fallback.
  if (!document.execCommand('insertText', false, text)) {
    area.setRangeText(text, area.selectionStart, area.selectionEnd, 'end');
    onChange(area.value);
  }
}

export function CodeEditor({ value, language, onChange, readOnly = false, label }: {
  value: string;
  language: Language;
  onChange: (value: string) => void;
  readOnly?: boolean;
  label: string;
}) {
  const html = useMemo(() => hljs.highlight(value, { language, ignoreIllegals: true }).value, [value, language]);
  const lines = value.split('\n').length;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    const area = e.currentTarget;
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      insert(area, '    ', onChange);
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const start = area.value.lastIndexOf('\n', area.selectionStart - 1) + 1;
      const indent = /^[ \t]*/.exec(area.value.slice(start, area.selectionStart))?.[0] ?? '';
      insert(area, `\n${indent}`, onChange);
    }
  };

  return (
    <div className={styles.codeView} data-readonly={readOnly || undefined}>
      <pre className={styles.gutter} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => `${i + 1}\n`).join('')}
      </pre>
      <div className={styles.editorStack}>
        {/* The trailing space keeps the last empty line as tall as the textarea's. */}
        <pre className={styles.code} aria-hidden="true">
          <code dangerouslySetInnerHTML={{ __html: `${html}\n ` }} />
        </pre>
        <textarea
          className={styles.editorInput}
          aria-label={label}
          value={value}
          readOnly={readOnly}
          rows={lines}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          {...noClipboard}
        />
      </div>
    </div>
  );
}
