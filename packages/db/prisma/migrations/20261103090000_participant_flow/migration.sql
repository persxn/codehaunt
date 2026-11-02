-- WP-03/WP-04: practice problems, per-language reference/naive solutions, consent, queue columns (ADR-025),
-- calibration runs. Only additive changes plus dropping problems.referenceSolution/referenceLanguage, which held
-- seed data only (moved to reference_solutions). New columns have defaults or are nullable: no table rewrite lock
-- beyond the instant ALTERs. Rollback: drop the new table/columns (no data depends on them yet).

CREATE TYPE "SolutionKind" AS ENUM ('REFERENCE', 'NAIVE');

ALTER TABLE "problems" ADD COLUMN "practice" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "reference_solutions" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "kind" "SolutionKind" NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reference_solutions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reference_solutions_problemId_language_kind_key" ON "reference_solutions"("problemId", "language", "kind");
ALTER TABLE "reference_solutions" ADD CONSTRAINT "reference_solutions_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "reference_solutions" ("id", "problemId", "language", "kind", "source", "updatedAt")
SELECT 'ref_' || "id", "id", "referenceLanguage", 'REFERENCE', "referenceSolution", CURRENT_TIMESTAMP
FROM "problems" WHERE "referenceSolution" IS NOT NULL AND "referenceLanguage" IS NOT NULL;

ALTER TABLE "problems" DROP COLUMN "referenceSolution", DROP COLUMN "referenceLanguage";

CREATE TABLE "calibration_runs" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "kind" "SolutionKind" NOT NULL,
    "source" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestedBy" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "calibration_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "calibration_runs_status_createdAt_idx" ON "calibration_runs"("status", "createdAt");
ALTER TABLE "calibration_runs" ADD CONSTRAINT "calibration_runs_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "participants"
    ADD COLUMN "consentAt" TIMESTAMP(3),
    ADD COLUMN "reuseConsent" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "guardianConsent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "submissions"
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "startedAt" TIMESTAMP(3);
CREATE INDEX "submissions_status_createdAt_idx" ON "submissions"("status", "createdAt");
