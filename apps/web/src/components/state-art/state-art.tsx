/**
 * State illustrations (ADR-032; generated assets 21–28): shown beside the state's text, never instead of it, so
 * they are decorative (empty alt). Pre-sized 320 px WebP, shown at 120–160 px.
 */
import accepted from './accepted.webp';
import budgetOut from './budget-out.webp';
import checkedIn from './checked-in.webp';
import connectionLost from './connection-lost.webp';
import judging from './judging.webp';
import notFound from './not-found.webp';
import timesUp from './times-up.webp';
import wrongAnswer from './wrong-answer.webp';
import styles from './state-art.module.css';

const ART = {
  accepted, 'wrong-answer': wrongAnswer, judging, 'budget-out': budgetOut, 'checked-in': checkedIn,
  'not-found': notFound, 'connection-lost': connectionLost, 'times-up': timesUp,
} as const;

export type StateArtKind = keyof typeof ART;

export function StateArt({ kind, size = 120 }: { kind: StateArtKind; size?: number }) {
  const art = ART[kind];
  return <img className={styles.art} src={art.src} width={size} height={size} alt="" aria-hidden="true" loading="lazy" />;
}
