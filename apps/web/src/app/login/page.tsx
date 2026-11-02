import { LoginForm } from './login-form';
import styles from './page.module.css';
import { GhostMark, Wordmark } from '@/components/ghost-mark';

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <GhostMark size={64} />
        <h1 className={styles.title}><Wordmark /></h1>
        <LoginForm />
      </div>
    </main>
  );
}
