import card from '@/components/card-page.module.css';

import hood from '../_public/hood.webp';
import { SystemCheck } from './system-check';

/** Public page shared with participants before the event (ADR-007): browser, connection, screen. Sends no data. */
export default function SystemCheckPage() {
  return (
    <main className={card.page}>
      <div className={`${card.card} ${card.wide} ${card.center}`}>
        <div className={`${card.arch} ${card.archFloat}`}><img src={hood.src} alt="" width={120} height={120} /></div>
        <p className={card.eyebrow}>CodeHaunt · before the event</p>
        <h1 className={card.title}>System check</h1>
        <p className={card.lead}>Checks this browser, your connection to CodeHaunt and your screen size. Nothing is sent or stored.</p>
        <SystemCheck />
      </div>
    </main>
  );
}
