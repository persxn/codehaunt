/**
 * Event facts for the public pages, from the client's poster (7 Nov 2026, 10 AM onwards, IEM Newtown Campus).
 * One place to change them: the hero, countdown and calendar file all read from here.
 */
export const EVENT = {
  name: 'CodeHaunt',
  organiser: 'CSI Student Chapter, UEM Kolkata',
  /** As given by the client, 2026-11-04. */
  poweredBy: ['SATYAMEBA', 'IEDC Laboratory of Dept. of CSE (IoT, CS, BT)'],
  venue: 'IEM Newtown Campus',
  dateLabel: 'Saturday, 7 November 2026',
  timeLabel: '10 AM onwards',
  /** 10:00 IST (UTC+5:30). */
  startsAt: Date.UTC(2026, 10, 7, 4, 30),
  /** Assumed close for the calendar entry and the countdown's "that's a wrap" (7 PM IST); the poster gives no end time. */
  endsAt: Date.UTC(2026, 10, 7, 13, 30),
  socials: [
    { network: 'Instagram', handle: 'csi.uemkolkata' },
    { network: 'Facebook', handle: 'csi.uemkolkata' },
    { network: 'X', handle: 'csi_uemkolkata' },
    { network: 'LinkedIn', handle: 'csi_uemkolkata' },
  ],
} as const;

function icsStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** A one-event iCalendar file as a data URL: a real "Add to calendar" without a backend or a third-party service. */
export function calendarHref(): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CSI UEM Kolkata//CodeHaunt//EN',
    'BEGIN:VEVENT',
    'UID:codehaunt-2026@codehaunt.csiuem.site',
    `DTSTAMP:${icsStamp(Date.UTC(2026, 10, 1))}`,
    `DTSTART:${icsStamp(EVENT.startsAt)}`,
    `DTEND:${icsStamp(EVENT.endsAt)}`,
    'SUMMARY:CodeHaunt: AI coding competition + tech talk',
    `LOCATION:${EVENT.venue}\\, Kolkata`,
    'DESCRIPTION:Bring a Windows laptop with Safe Exam Browser installed. https://codehaunt.csiuem.site',
    'URL:https://codehaunt.csiuem.site',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}
