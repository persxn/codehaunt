/**
 * Halloween ornaments for the working screens (ADR-037): decorative only (aria-hidden), tokens only.
 * - `Bat`: the poster's bat silhouette.
 * - `BatBurst`: three bats that fly out once (the Accepted moment); nothing under reduced motion.
 * - `GhostAvatar`: the tutor's small ghost beside its replies (static).
 * The bracket corners of panes are CSS only (`.cornered` in `ornaments.module.css`).
 */
import styles from './ornaments.module.css';

export function Bat({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size * 0.5} viewBox="0 0 40 20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 6c1.2-2 1.9-3.6 2-5 .9 1.4 1.3 2.6 1.3 3.8C26 2.6 31 1 40 4c-4 1.6-5.6 4.4-5.4 8-2.4-1.6-5-1.8-7.4.2-1.2-1.6-2.8-2.4-4.6-2.2L20 16l-2.6-6c-1.8-.2-3.4.6-4.6 2.2-2.4-2-5-1.8-7.4-.2C5.6 8.4 4 5.6 0 4c9-3 14-1.4 16.7.8 0-1.2.4-2.4 1.3-3.8.1 1.4.8 3 2 5z"
      />
    </svg>
  );
}

export function BatBurst() {
  return (
    <span className={styles.burst} aria-hidden="true">
      <Bat size={28} className={styles.bat1} />
      <Bat size={20} className={styles.bat2} />
      <Bat size={24} className={styles.bat3} />
    </span>
  );
}

export function GhostAvatar({ size = 26 }: { size?: number }) {
  return (
    <svg className={styles.avatar} width={size} height={size * 1.1} viewBox="0 0 34 38" aria-hidden="true">
      <path
        className={styles.avatarBody}
        d="M17 2C9.3 2 3.5 7.8 3.5 15.5V34l4.2-3.6 3.4 3.4 3.3-3.4 2.6 2.9 2.6-2.9 3.3 3.4 3.4-3.4 4.2 3.6V15.5C30.5 7.8 24.7 2 17 2z"
      />
      <ellipse className={styles.avatarEye} cx="12.4" cy="15" rx="1.9" ry="2.6" />
      <ellipse className={styles.avatarEye} cx="21.6" cy="15" rx="1.9" ry="2.6" />
    </svg>
  );
}
