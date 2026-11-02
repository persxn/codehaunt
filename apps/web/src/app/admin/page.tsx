import { currentUser } from '@/lib/session';

/** Placeholder: the admin console arrives in WP-04. */
export default async function AdminHome() {
  const user = await currentUser();
  return (
    <main>
      <h1>Admin</h1>
      <p>Signed in as {user?.name}.</p>
    </main>
  );
}
