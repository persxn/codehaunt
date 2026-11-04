# Check-in

**Purpose**: Provide staff with a QR-code and manual entry check-in page for participants.

## Contents

| File | Description |
|------|-------------|
| `page.tsx` | Server page that renders the `Scanner` component inside a `<Suspense>` wrapper. |
| `scanner.tsx` | Client component handling camera QR scanning, manual code entry, and displaying results: success = the art pops in a green arch with bats (ADR-037), failure = the card shakes. |
| `checkin.module.css` | One cornered card, 48 px touch targets, the success/failure moments (off under reduced motion). |

## Affects / Depends On

- **API**: `POST /api/staff/checkin` – used to submit a QR or manual code together with the seat label.
- **Components**: `Field`, `Button`, icons (`Check`, `Alert`).
- **Helpers**: `postJSON` from `../api` for network calls.

## Entry Points & How to Test

1. Navigate to `/admin/checkin` (any staff role may open). The server page (`page.tsx`) renders the scanner.
2. Enter a seat label (required for check-in).
3. Click **Start camera** – allow camera permissions. The QR scanner will read a code prefixed with `CH1:` and automatically submit.
4. Alternatively, type a code into the *Type the code* field and press **Check in**.
5. A success panel shows the participant name, enrolment number and seat; a failure panel shows the error message.
6. Press **Next** to clear the result and resume scanning.

## Gotchas

- Camera access works only on HTTPS or localhost; otherwise the fallback form is shown.
- The QR scanner stops after a successful read; press **Next** to resume.
- The seat label must be filled before any check-in; otherwise an error is shown.
- The hidden canvas is used for QR processing – it is not visible to users.
