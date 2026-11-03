import { redirect } from 'next/navigation';

import { currentUser } from '@/lib/session';

import styles from './account.module.css';
import { PasswordForm } from './password-form';

/** Any signed-in person: change your own password (ADR-020). */
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Your account</h1>
        <p className={styles.muted}>{user.name} · {user.username}</p>
        <PasswordForm />
        <a href="/">Back</a>
      </div>
    </main>
  );
}
