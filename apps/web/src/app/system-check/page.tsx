import { GhostMark, Wordmark } from '@/components/ghost-mark';

import styles from './system-check.module.css';
import { SystemCheck } from './system-check';

/** Public page shared with participants before the event (ADR-007): browser, connection, screen. Sends no data. */
export default function SystemCheckPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <GhostMark size={64} />
        <h1 className={styles.title}><Wordmark /></h1>
        <h2 className={styles.subtitle}>System check</h2>
        <SystemCheck />
      </div>
    </main>
  );
}
