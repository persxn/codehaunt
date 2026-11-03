# staff
Staff (`/admin/staff`, ADMIN and ORGANIZER): add, remove, reset passwords; admins also change roles.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route |
| `staff-admin.tsx` | table with actions; add-staff form (organizers: volunteers only) |

## Affects / depends on
- Calls `GET/POST /api/admin/staff`, `PATCH /api/admin/staff/{id}`, `PUT /api/admin/roles/{id}`, `POST /api/admin/users/{id}/password`.
- Depends on `../api.ts`, `../event-picker.tsx`, `../admin.module.css`, `src/components/`.

## Entry points & how to test
Open the page in the admin console; `e2e/admin.spec.ts` drives it end to end.

## Gotchas
The server decides who may do what (`server/staff-service.ts`); removal ends sessions at once; role changes need a reason.
