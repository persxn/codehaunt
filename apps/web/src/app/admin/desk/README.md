# Desk

**Purpose**: List participants for a selected event, allow searching, refreshing, and promoting wait-listed participants.

## Contents

| File | Description |
|------|-------------|
| `page.tsx` | Server page that renders the `Desk` client component inside a `Suspense` wrapper. |
| `desk.tsx` | Client component handling event selection, participant loading, searching, and promotion. |

## Affects / Depends On

- **API**:
  - `GET /api/staff/participants?eventId=ID` – fetch participants for the chosen event.
  - `POST /api/staff/participants/{id}/promote` – promote a wait-listed participant.
  - `eventOptions(admin: boolean)` – retrieve available events for selection.
- **Components**: `Field`, `Button`, table styling from `admin.module.css`.
- **Helpers**: `getJSON`, `postJSON`, `eventOptions` from `../api`.

## Entry Points & How to Test

1. Navigate to `/admin/desk`. If no `?event=` query parameter is present, a dropdown of events appears.
2. Select an event – the URL updates with `?event=<id>` and the participant table loads.
3. Use the search box to filter by name, enrolment number, or seat label (client-side).
4. Click **Refresh** to reload the participant list.
5. For any row with status **waitlisted**, click **Promote** – the row updates after the API call.

## Gotchas

- The component shows a loading indicator while fetching events or participants.
- Errors from API calls are displayed inline in a red-styled paragraph.
- The event selector only appears when `eventId` is missing; otherwise the desk UI is shown.
- `router.replace` updates the query string without a full page navigation.
