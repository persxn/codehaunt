-- WP-11 (ADR-041, ADR-042): event default password, forced password change, hints-only problems, guardrail log.
-- Additive only: nullable or defaulted columns, so the previous image keeps working (rollback-safe).

-- AlterTable
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "events" ADD COLUMN "defaultPasswordHash" TEXT;

-- AlterTable
ALTER TABLE "problems" ADD COLUMN "hintsOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "prompt_turns" ADD COLUMN "guardrail" JSONB;
