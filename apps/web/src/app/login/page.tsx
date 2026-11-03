import '@fontsource/creepster/400.css';

import deskScene from '../_public/desk-scene.webp';
import hood from '../_public/hood.webp';
import { LockIcon } from '../_public/icons';
import ui from '../_public/public.module.css';
import { LoginForm } from './login-form';
import styles from './page.module.css';

export const metadata = { title: 'Sign in · CodeHaunt' };

/** Sign-in in the public theme (ADR-031). Participants arrive here inside SEB; staff from any browser (ADR-029). */
export default function LoginPage() {
  return (
    <div className={`${ui.theme} ${ui.textured} ${styles.page}`}>
      <main className={styles.panel}>
        <a className={styles.mark} href="/">
          <img src={hood.src} width={44} height={44} alt="" />
          <span>CodeHaunt</span>
        </a>
        <div className={styles.body}>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.intro}>Use the username and password from your registration.</p>
          <LoginForm />
          <ul className={styles.notes}>
            <li>
              <LockIcon />
              <span>
                <strong>Participants</strong> sign in inside Safe Exam Browser, after a volunteer has scanned your badge
                at the desk.
              </span>
            </li>
            <li>
              <LockIcon />
              <span>
                <strong>Organisers and volunteers</strong> can use any browser.
              </span>
            </li>
          </ul>
        </div>
        <p className={styles.foot}>CSI Student Chapter, UEM Kolkata · 7 November 2026</p>
      </main>
      <div className={styles.art} aria-hidden>
        <img src={deskScene.src} width={deskScene.width} height={deskScene.height} alt="" fetchPriority="high" />
      </div>
    </div>
  );
}
