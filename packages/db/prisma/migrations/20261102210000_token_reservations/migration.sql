-- ADR-022: reserve-then-settle token accounting. Adding enum values is non-blocking and needs no rollback
-- (unused values are harmless).
ALTER TYPE "TokenEntryKind" ADD VALUE 'RESERVE';
ALTER TYPE "TokenEntryKind" ADD VALUE 'RELEASE';
