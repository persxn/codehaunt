-- WP-05 (ADR-028): contest clock (pause), projector link, results state, per-participant extra time, elapsed
-- contest time and the IE re-check on submissions, and the incidents table. Additive only; new columns are nullable or
-- have defaults, so each ALTER is instant. Rollback: drop the new table, columns and enums (nothing else depends on them).

-- CreateEnum
CREATE TYPE "ResultsState" AS ENUM ('NONE', 'PROVISIONAL', 'FINAL');

-- CreateEnum
CREATE TYPE "IncidentKind" AS ENUM ('JUDGE_IE', 'PROXY_REFUSAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "frozenAt" TIMESTAMP(3),
ADD COLUMN     "projectorTokenHash" TEXT,
ADD COLUMN     "provisionalAt" TIMESTAMP(3),
ADD COLUMN     "resultsState" "ResultsState" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "extraMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "contestMs" INTEGER,
ADD COLUMN     "firstInternalError" TEXT;

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "participantId" TEXT,
    "submissionId" TEXT,
    "kind" "IncidentKind" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "detail" JSONB NOT NULL,
    "penaltyReversed" BOOLEAN NOT NULL DEFAULT false,
    "resolution" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incidents_eventId_createdAt_idx" ON "incidents"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "incidents_submissionId_idx" ON "incidents"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "events_projectorTokenHash_key" ON "events"("projectorTokenHash");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

