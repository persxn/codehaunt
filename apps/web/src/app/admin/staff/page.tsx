import { currentUser } from '@/lib/session';

import { StaffAdmin } from './staff-admin';

/** Staff (ADMIN, ORGANIZER): organizers add and remove volunteers; admins manage everyone and change roles. */
export default async function StaffPage() {
  const user = await currentUser();
  return (
    <section>
      <h1>Staff</h1>
      <StaffAdmin role={user?.role ?? 'VOLUNTEER'} selfId={user?.id ?? ''} />
    </section>
  );
}
