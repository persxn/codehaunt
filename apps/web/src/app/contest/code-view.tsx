'use client';
/**
 * Read-only, highlighted code (ADR-007): no caret, no input, nothing to type or paste into. The only HTML injected is
 * highlight.js output, which escapes the source.
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

export function CodeView({ source, language, label = 'Current code (read-only)' }: { source: string; language: Language; label?: string }) {
  const html = useMemo(() => hljs.highlight(source, { language, ignoreIllegals: true }).value, [source, language]);
  const lines = source.replace(/\n$/, '').split('\n').length;
  const block = (e: React.SyntheticEvent) => e.preventDefault();
  return (
    <div className={styles.codeView} tabIndex={0} role="region" aria-label={label} onPaste={block} onDrop={block}>
      <pre className={styles.gutter} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => `${i + 1}\n`).join('')}
      </pre>
      <pre className={styles.code}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
