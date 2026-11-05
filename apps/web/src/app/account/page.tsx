import { redirect } from 'next/navigation';

import { currentUser } from '@/lib/session';

import card from '@/components/card-page.module.css';

import styles from './account.module.css';
import { PasswordForm } from './password-form';

/** Any signed-in person: change your own password (ADR-020). */
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // ADR-041: signed in with the event's default password; nothing else opens until it is changed.
  const first = user.mustChangePassword;
  return (
    <main className={card.page}>
      <div className={card.card}>
        <p className={card.eyebrow}>{user.name} · {user.username}</p>
        <h1 className={card.title}>{first ? 'Choose your password' : 'Your account'}</h1>
        <p className={card.lead}>
          {first
            ? 'You signed in with the event password. Choose your own now: the contest opens once you have. Type the event password as your current password.'
            : 'Change your password. You stay signed in on this device.'}
        </p>
        <hr className={card.rule} />
        <PasswordForm next={first ? (user.role === 'PARTICIPANT' ? '/contest' : '/admin') : null} />
        {!first && <a className={card.back} href="/">← Back</a>}
      </div>
    </main>
  );
}
