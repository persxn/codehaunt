# badges
Badges (`/admin/badges`, ADMIN and ORGANIZER): issue a password and a single-use check-in QR per participant not yet checked in, and print them.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route |
| `badge-sheet.tsx` | issue (with a warning), QR codes via `qrcode`, print |
| `badges.module.css` | screen grid; A4 print layout, 2 × 4 per page |

## Affects / depends on
- Calls `POST /api/admin/badges`, `GET /api/staff/events`.
- Depends on `../api.ts`, `../event-picker.tsx`, `../admin.module.css`, `src/components/`.

## Entry points & how to test
Open the page in the admin console; `e2e/admin.spec.ts` drives it end to end.

## Gotchas
Passwords and codes exist only in this page's memory (never stored or cached); reissuing replaces earlier badges.
