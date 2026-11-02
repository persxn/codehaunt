import { redirect } from 'next/navigation';

import { currentUser } from '@/lib/session';

export default async function Home() {
  const user = await currentUser();
  redirect(user?.role === 'PARTICIPANT' ? '/contest' : user?.role === 'VOLUNTEER' ? '/admin/checkin' : '/admin');
}
