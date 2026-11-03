import { Projector } from './projector';

export const metadata = { title: 'CodeHaunt leaderboard', referrer: 'no-referrer' };

/** Public projector (ADR-008, ADR-028): no login; the token in the path is the key. */
export default async function ProjectorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Projector token={token} />;
}
