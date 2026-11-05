/**
 * Zod schema for event configuration and related constants.
 */
import { z } from 'zod';
import { Language } from './judge.ts';

/** Event status enum, mirrors DB enum. */
export const EventStatus = z.enum([
  'DRAFT',
  'CHECK_IN',
  'RUNNING',
  'PAUSED',
  'ENDED',
  'JUDGING',
  'PUBLISHED',
]);
export type EventStatus = z.infer<typeof EventStatus>;

/** Keys that remain editable after event lock (ADR-006). */
export const LIVE_EDITABLE_KEYS = ['budget', 'schedule'] as const;
export type LIVE_EDITABLE_KEYS = typeof LIVE_EDITABLE_KEYS[number];

/**
 * Main event configuration schema. Nested sections use .prefault({}) so their field defaults
 * apply when the section is omitted (zod 4's .default() would return {} unparsed).
 */
export const EventConfig = z.object({
  branding: z.object({
    title: z.string().min(1).max(120),
    subtitle: z.string().max(200).optional(),
  }),
  schedule: z.object({
    checkInAt: z.iso.datetime({ offset: true }),
    startsAt: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().int().min(10).max(1440).default(180),
    freezeMinutes: z.number().int().min(0).max(240).default(30),
  }),
  languages: z
    .array(Language)
    .min(1)
    .default(['c', 'cpp', 'java', 'python'])
    .refine((arr) => new Set(arr).size === arr.length, {
      message: 'duplicate languages',
    }),
  timeMultiplier: z.object({
    c: z.number().min(0.5).max(20),
    cpp: z.number().min(0.5).max(20),
    java: z.number().min(0.5).max(20),
    python: z.number().min(0.5).max(20),
  }).default({ c: 1, cpp: 1, java: 2, python: 3 }),
  budget: z.object({
    tokensPerParticipant: z.number().int().min(1000).max(10_000_000).default(60000),
    contextTokens: z.number().int().min(512).max(131_072).default(8192),
    contextWarnPercent: z.number().int().min(50).max(99).default(80),
    /** Reply cap per prompt (the gateway also caps it to what is left of the context). */
    replyTokens: z.number().int().min(64).max(4096).default(1024),
    /** Longest question to the tutor (ADR-033: 1,000). */
    maxPromptChars: z.number().int().min(100).max(20000).default(1000),
  }).prefault({}),
  model: z.object({
    baseUrl: z.url(),
    name: z.string().min(1),
    /** `tutor-v1` (ADR-033); unknown versions fall back to it. */
    systemPromptVersion: z.string().min(1),
    /** Most code lines a tutor reply may show (ADR-033 reply filter). */
    maxExampleLines: z.number().int().min(0).max(40).default(0), // ADR-046 (client, 2026-11-06): 0 = words only, no code at all; was 3 (ADR-038)
    temperature: z.number().min(0).max(2).default(0.2),
    hostedAllowed: z.boolean().default(false),
  }),
  judge: z.object({
    rubricVersion: z.string().min(1),
    model: z.string().default('gpt-oss:120b'),
  }),
  scoring: z.object({
    weights: z.object({
      correctness: z.number().min(0).max(1).default(0.55),
      tokenEfficiency: z.number().min(0).max(1).default(0.15),
      resourceEfficiency: z.number().min(0).max(1).default(0.10),
      processQuality: z.number().min(0).max(1).default(0.20),
    }).refine((w) => {
      const sum = w.correctness + w.tokenEfficiency + w.resourceEfficiency + w.processQuality;
      return Math.abs(sum - 1) < 1e-6;
    }, { message: 'weights must sum to 1' }).prefault({}),
    /** Percent of the problem's value lost per counted rejection, solved or not (ADR-034). An old
     *  `wrongSubmissionPenalty` (points) key is dropped by parsing, so stored configs read as the default 20. */
    wrongSubmissionPenaltyPct: z.number().min(0).max(100).default(20),
    decayPerMinute: z.number().min(0).max(100).default(2),
  }).prefault({}),
  leaderboard: z.object({
    projectorEnabled: z.boolean().default(true),
    /** Appeal window between provisional and final results (ADR-009, ADR-028). */
    appealMinutes: z.number().int().min(0).max(240).default(30),
  }).prefault({}),
  access: z.object({
    sebRequired: z.boolean().default(true),
    checkInCap: z.number().int().min(1).max(10_000).default(40),
    allowMinors: z.boolean().default(false),
  }).prefault({}),
  consent: z.object({
    text: z.string().min(1),
    retentionDays: z.number().int().min(1).max(365).default(30),
  }),
}).strict();

export type EventConfig = z.infer<typeof EventConfig>;
