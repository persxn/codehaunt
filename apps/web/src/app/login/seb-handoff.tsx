'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, CheckIcon, DownloadIcon, LockIcon } from '../_public/icons';
import ui from '../_public/public.module.css';
import styles from './page.module.css';

/** Official download page (verified 2026-11-05: SEB 3.10.3 for Windows 10/11, 3.7.1.1 for macOS). */
const SEB_DOWNLOAD = 'https://safeexambrowser.org/download_en.html';

/**
 * ADR-039: a participant whose password was right but who is not in SEB (`seb_required`) is handed to SEB. A
 * `sebs://` link makes SEB fetch `/CodeHaunt.seb` over HTTPS and start the exam at `/login?seb=1`; the browser
 * first asks whether to open Safe Exam Browser. Nothing is signed in here: SEB is a separate browser, so the
 * participant signs in again inside it.
 */
export function SebHandoff({ onBack }: { onBack: () => void }) {
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const url = `sebs://${window.location.host}/CodeHaunt.seb`;
    setLaunchUrl(url);
    heading.current?.focus();
    // Ask straight away; Edge shows "Open Safe Exam Browser?". If SEB is missing nothing happens, hence the help.
    window.location.href = url;
  }, []);

  return (
    <section aria-labelledby="seb-title">
      <h1 id="seb-title" ref={heading} tabIndex={-1} className={styles.title}>Open Safe Exam Browser</h1>
      <p className={styles.intro}>
        Your details are right. The contest runs only inside Safe Exam Browser (SEB), so your browser is asking to open
        it now.
      </p>

      <ol className={styles.steps}>
        <li><span>1</span><div>When the browser asks <strong>“Open Safe Exam Browser?”</strong>, choose <strong>Open</strong>.</div></li>
        <li><span>2</span><div>SEB fills the screen and shows the CodeHaunt sign-in page.</div></li>
        <li><span>3</span><div>Sign in there again with the same username and password.</div></li>
      </ol>

      <a className={`${ui.btn} ${ui.primary} ${styles.wide}`} href={launchUrl ?? undefined} aria-disabled={!launchUrl}>
        <LockIcon />
        Open Safe Exam Browser
      </a>
      <button type="button" className={`${ui.btn} ${ui.secondary} ${styles.wide}`} aria-expanded={help} aria-controls="seb-help" onClick={() => setHelp((h) => !h)}>
        Nothing opened? I don’t have SEB
      </button>

      {help && (
        <div id="seb-help" className={styles.help}>
          <p><strong>Install Safe Exam Browser</strong> (free; Windows 10/11 or macOS), then come back to this page.</p>
          <ol className={styles.steps}>
            <li><span>1</span><div>Download it from the official site and run the installer.</div></li>
            <li><span>2</span><div>Return here and press <strong>Open Safe Exam Browser</strong>.</div></li>
          </ol>
          <a className={`${ui.btn} ${ui.secondary} ${styles.wide}`} href={SEB_DOWNLOAD} target="_blank" rel="noopener noreferrer">
            <DownloadIcon />
            Download Safe Exam Browser
          </a>
          <p className={styles.small}>
            <CheckIcon />
            <span>Already installed? <a href="/system-check">Run the system check</a> or ask a volunteer.</span>
          </p>
        </div>
      )}

      <button type="button" className={styles.back} onClick={onBack}>
        <ArrowRightIcon className={styles.backIcon} /> Back to sign in
      </button>
    </section>
  );
}
