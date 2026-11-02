# prisma

Prisma schema and migration directory.

## Contents
| Path | What it does |
|---|---|
| `schema.prisma` | Database schema definition (tables, enums, indexes) |
| `migrations/` | Migration history (see its README) |

## Affects / depends on
- Used by `prisma generate` to produce the client in `packages/db/src`.
- Changing the schema requires a new migration.
