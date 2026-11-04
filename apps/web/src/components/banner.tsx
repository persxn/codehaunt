import React from 'react';

import styles from './banner.module.css';
import { StateArt, type StateArtKind } from './state-art/state-art';

export function Banner({
  tone,
  art,
  children,
}: {
  tone: 'info' | 'warning' | 'muted' | 'danger';
  /** A state illustration beside the text (ADR-032). */
  art?: StateArtKind;
  children: React.ReactNode;
}) {
  return (
    <div role="status" className={`${styles.banner} ${styles[tone]}`} data-art={art ? '' : undefined}>
      {art && <StateArt kind={art} size={96} />}
      <div>{children}</div>
    </div>
  );
}
