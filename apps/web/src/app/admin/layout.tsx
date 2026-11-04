import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { Wordmark } from '@/components/ghost-mark';
import { currentUser } from '@/lib/session';

import styles from './admin.module.css';
import { Nav, SignOut } from './nav';

/** Admin console shell: header, role-based nav, content (max 1200 px). Access per path: packages/auth/src/policy.ts. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user || user.role === 'PARTICIPANT') redirect('/');
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Wordmark />
        <span className={styles.consoleLabel}>Admin console</span>
        <span className={styles.who}>{user.name} · {user.role.toLowerCase()}</span>
        <SignOut />
      </header>
      <Suspense>
        <Nav role={user.role} />
      </Suspense>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
