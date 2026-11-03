import { Suspense } from 'react';
import Desk from './desk';

export const metadata = {
  title: 'Desk',
};

export default function Page() {
  return (
    <section>
      <h1>Desk</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Desk />
      </Suspense>
    </section>
  );
}
