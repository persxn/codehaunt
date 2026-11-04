import card from '@/components/card-page.module.css';
import { StateArt } from '@/components/state-art/state-art';

/** 404 for every unknown path (ADR-032: the shared palette and the "not found" illustration; WP-07 Part 2 card). */
export default function NotFound() {
  return (
    <main className={card.page}>
      <div className={`${card.card} ${card.center}`}>
        <div className={`${card.arch} ${card.archFloat}`}><StateArt kind="not-found" size={120} /></div>
        <p className={card.eyebrow}>Error 404</p>
        <h1 className={card.title}>Nothing haunts this page</h1>
        <p className={card.lead}>The page you asked for doesn&apos;t exist.</p>
        <a className={card.back} style={{ justifySelf: 'center' }} href="/">← Back to CodeHaunt</a>
      </div>
    </main>
  );
}
