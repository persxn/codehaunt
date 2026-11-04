/**
 * The tutor's "thinking" state (client request 2026-11-04: cuter): a small ghost that floats and blinks, with a
 * thought bubble whose dots pop in turn. A state change, not ambient motion (ADR-032); still under reduced motion.
 */
import styles from './tutor-thinking.module.css';

export function TutorThinking() {
  return (
    <span className={styles.wrap} role="status">
      <svg className={styles.ghost} width="34" height="38" viewBox="0 0 34 38" aria-hidden="true">
        <path
          className={styles.body}
          d="M17 2C9.3 2 3.5 7.8 3.5 15.5V34l4.2-3.6 3.4 3.4 3.3-3.4 2.6 2.9 2.6-2.9 3.3 3.4 3.4-3.4 4.2 3.6V15.5C30.5 7.8 24.7 2 17 2z"
        />
        <g className={styles.eyes}>
          <ellipse cx="12.4" cy="15" rx="1.9" ry="2.6" />
          <ellipse cx="21.6" cy="15" rx="1.9" ry="2.6" />
        </g>
        <ellipse className={styles.cheek} cx="9.2" cy="20.2" rx="2.2" ry="1.3" />
        <ellipse className={styles.cheek} cx="24.8" cy="20.2" rx="2.2" ry="1.3" />
        <path className={styles.mouth} d="M15.2 21.4q1.8 1.6 3.6 0" />
      </svg>
      <span className={styles.bubble} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </span>
      <span className={styles.label}>The tutor is thinking</span>
    </span>
  );
}
