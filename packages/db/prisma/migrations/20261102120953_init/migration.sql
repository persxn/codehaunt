-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ORGANIZER', 'VOLUNTEER', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'CHECK_IN', 'RUNNING', 'PAUSED', 'ENDED', 'JUDGING', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('C', 'CPP', 'JAVA', 'PYTHON');

-- CreateEnum
CREATE TYPE "TestVisibility" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'CHECKED_IN', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "SubmissionKind" AS ENUM ('SAMPLE', 'SUBMIT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "TokenEntryKind" AS ENUM ('GRANT', 'USAGE', 'TOP_UP', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problems" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "ord" INTEGER NOT NULL,
    "timeLimitMs" INTEGER NOT NULL,
    "memoryLimitMb" INTEGER NOT NULL,
    "checker" JSONB NOT NULL,
    "referenceSolution" TEXT,
    "referenceLanguage" "Language",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "visibility" "TestVisibility" NOT NULL,
    "ord" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "expectedOutput" TEXT NOT NULL,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enrolmentNo" TEXT NOT NULL,
    "phone" TEXT,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'REGISTERED',
    "checkInTokenHash" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "seatLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_turns" (
    "id" TEXT NOT NULL,
    "chatSessionId" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "reply" TEXT,
    "model" TEXT NOT NULL,
    "node" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_versions" (
    "id" TEXT NOT NULL,
    "chatSessionId" TEXT NOT NULL,
    "promptTurnId" TEXT,
    "language" "Language" NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "codeVersionId" TEXT NOT NULL,
    "kind" "SubmissionKind" NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verdicts" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "testsPassed" INTEGER NOT NULL,
    "testsTotal" INTEGER NOT NULL,
    "maxTimeMs" INTEGER NOT NULL,
    "maxMemoryKb" INTEGER NOT NULL,
    "compileLog" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verdicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judge_reviews" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "problemId" TEXT,
    "rubricVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT NOT NULL,
    "injectionFlag" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judge_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_overrides" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "problemId" TEXT,
    "component" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_ledger" (
    "id" BIGSERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "kind" "TokenEntryKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "promptTurnId" TEXT,
    "actorId" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "problems_eventId_ord_idx" ON "problems"("eventId", "ord");

-- CreateIndex
CREATE UNIQUE INDEX "problems_eventId_slug_key" ON "problems"("eventId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_problemId_visibility_ord_key" ON "test_cases"("problemId", "visibility", "ord");

-- CreateIndex
CREATE UNIQUE INDEX "participants_checkInTokenHash_key" ON "participants"("checkInTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "participants_eventId_userId_key" ON "participants"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "participants_eventId_enrolmentNo_key" ON "participants"("eventId", "enrolmentNo");

-- CreateIndex
CREATE INDEX "chat_sessions_participantId_problemId_idx" ON "chat_sessions"("participantId", "problemId");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_turns_idempotencyKey_key" ON "prompt_turns"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_turns_chatSessionId_ord_key" ON "prompt_turns"("chatSessionId", "ord");

-- CreateIndex
CREATE INDEX "code_versions_chatSessionId_createdAt_idx" ON "code_versions"("chatSessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_idempotencyKey_key" ON "submissions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "submissions_participantId_problemId_createdAt_idx" ON "submissions"("participantId", "problemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "verdicts_submissionId_key" ON "verdicts"("submissionId");

-- CreateIndex
CREATE INDEX "judge_reviews_participantId_idx" ON "judge_reviews"("participantId");

-- CreateIndex
CREATE INDEX "score_overrides_participantId_idx" ON "score_overrides"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "token_ledger_idempotencyKey_key" ON "token_ledger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "token_ledger_participantId_idx" ON "token_ledger"("participantId");

-- CreateIndex
CREATE INDEX "audit_log_targetType_targetId_idx" ON "audit_log"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_turns" ADD CONSTRAINT "prompt_turns_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_versions" ADD CONSTRAINT "code_versions_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_versions" ADD CONSTRAINT "code_versions_promptTurnId_fkey" FOREIGN KEY ("promptTurnId") REFERENCES "prompt_turns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_codeVersionId_fkey" FOREIGN KEY ("codeVersionId") REFERENCES "code_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_reviews" ADD CONSTRAINT "judge_reviews_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_overrides" ADD CONSTRAINT "score_overrides_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_promptTurnId_fkey" FOREIGN KEY ("promptTurnId") REFERENCES "prompt_turns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only ledgers: audit_log and token_ledger accept INSERT only.
-- Budgets are SUM(token_ledger.delta), and the audit trail must be tamper-evident,
-- so UPDATE, DELETE and TRUNCATE are refused at the database, not just in code.
CREATE FUNCTION codehaunt_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION codehaunt_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION codehaunt_append_only();
CREATE TRIGGER token_ledger_append_only BEFORE UPDATE OR DELETE ON "token_ledger"
  FOR EACH ROW EXECUTE FUNCTION codehaunt_append_only();
CREATE TRIGGER token_ledger_no_truncate BEFORE TRUNCATE ON "token_ledger"
  FOR EACH STATEMENT EXECUTE FUNCTION codehaunt_append_only();
