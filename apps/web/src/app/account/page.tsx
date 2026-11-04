import { redirect } from 'next/navigation';

import { currentUser } from '@/lib/session';

import card from '@/components/card-page.module.css';

import styles from './account.module.css';
import { PasswordForm } from './password-form';

/** Any signed-in person: change your own password (ADR-020). */
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return (
    <main className={card.page}>
      <div className={card.card}>
        <p className={card.eyebrow}>{user.name} · {user.username}</p>
        <h1 className={card.title}>Your account</h1>
        <p className={card.lead}>Change your password. You stay signed in on this device.</p>
        <hr className={card.rule} />
        <PasswordForm />
        <a className={card.back} href="/">← Back</a>
      </div>
    </main>
  );
}
