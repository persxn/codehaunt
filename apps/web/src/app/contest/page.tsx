import { currentUser } from '@/lib/session';

/** Placeholder: the participant flow arrives in WP-03. */
export default async function ContestHome() {
  const user = await currentUser();
  return (
    <main>
      <h1>Contest</h1>
      <p>Welcome, {user?.name}. The contest has not started.</p>
    </main>
  );
}
