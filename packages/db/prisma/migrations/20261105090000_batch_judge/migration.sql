-- WP-07 (ADR-035): batch-judging queue (judge_jobs) and GPT-OSS problem drafts (problem_drafts, R8-Q6). Additive
-- only: new enums and tables, nothing existing changes. Rollback: drop both tables and the three enums.

-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('TEST', 'NAIVE');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "JudgeJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'NEEDS_MANUAL');

-- CreateTable
CREATE TABLE "problem_drafts" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "kind" "DraftKind" NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "input" TEXT,
    "expectedOutput" TEXT,
    "language" "Language",
    "source" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judge_jobs" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "status" "JudgeJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judge_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "problem_drafts_problemId_status_idx" ON "problem_drafts"("problemId", "status");

-- CreateIndex
CREATE INDEX "judge_jobs_eventId_status_idx" ON "judge_jobs"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "judge_jobs_participantId_rubricVersion_key" ON "judge_jobs"("participantId", "rubricVersion");

-- AddForeignKey
ALTER TABLE "problem_drafts" ADD CONSTRAINT "problem_drafts_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_jobs" ADD CONSTRAINT "judge_jobs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_jobs" ADD CONSTRAINT "judge_jobs_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

