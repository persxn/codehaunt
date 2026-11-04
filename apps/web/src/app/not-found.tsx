import { StateArt } from '@/components/state-art/state-art';

import styles from './not-found.module.css';

/** 404 for every unknown path (ADR-032: the shared palette and the "not found" illustration). */
export default function NotFound() {
  return (
    <main className={styles.page}>
      <StateArt kind="not-found" size={160} />
      <h1 className={styles.title}>Nothing haunts this page</h1>
      <p className={styles.text}>The page you asked for doesn&apos;t exist.</p>
      <a className={styles.link} href="/">Back to CodeHaunt</a>
    </main>
  );
}
