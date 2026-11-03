/** The Event editor's form, one row per EventConfig field (contracts/event-config.ts). Sections in display order. */
import type { EventConfig } from '@codehaunt/contracts';

export type Kind = 'text' | 'textarea' | 'number' | 'datetime' | 'bool';
export interface FieldSpec { path: string; label: string; kind: Kind; step?: number; hint?: string }

export const SECTIONS: Array<{ key: keyof EventConfig; title: string; fields: FieldSpec[] }> = [
  { key: 'branding', title: 'Branding', fields: [
    { path: 'branding.title', label: 'Title', kind: 'text' },
    { path: 'branding.subtitle', label: 'Subtitle', kind: 'text' },
  ] },
  { key: 'schedule', title: 'Schedule', fields: [
    { path: 'schedule.checkInAt', label: 'Check-in opens', kind: 'datetime' },
    { path: 'schedule.startsAt', label: 'Contest starts', kind: 'datetime' },
    { path: 'schedule.durationMinutes', label: 'Duration (minutes)', kind: 'number' },
    { path: 'schedule.freezeMinutes', label: 'Leaderboard freeze (minutes before the end)', kind: 'number' },
  ] },
  { key: 'timeMultiplier', title: 'Time limit multipliers (ADR-005)', fields: [
    { path: 'timeMultiplier.c', label: 'C', kind: 'number', step: 0.1 },
    { path: 'timeMultiplier.cpp', label: 'C++', kind: 'number', step: 0.1 },
    { path: 'timeMultiplier.java', label: 'Java', kind: 'number', step: 0.1 },
    { path: 'timeMultiplier.python', label: 'Python', kind: 'number', step: 0.1 },
  ] },
  { key: 'budget', title: 'Budget (editable during the contest)', fields: [
    { path: 'budget.tokensPerParticipant', label: 'Tokens per participant', kind: 'number', hint: 'A change adjusts everyone already checked in by the difference.' },
    { path: 'budget.contextTokens', label: 'Context window (tokens)', kind: 'number' },
    { path: 'budget.contextWarnPercent', label: 'Warn at context fill (%)', kind: 'number' },
    { path: 'budget.replyTokens', label: 'Reply cap (tokens)', kind: 'number' },
    { path: 'budget.maxPromptChars', label: 'Max prompt length (characters)', kind: 'number' },
  ] },
  { key: 'model', title: 'Model', fields: [
    { path: 'model.baseUrl', label: 'Inference base URL', kind: 'text' },
    { path: 'model.name', label: 'Model name', kind: 'text' },
    { path: 'model.systemPromptVersion', label: 'System prompt version', kind: 'text' },
    { path: 'model.temperature', label: 'Temperature', kind: 'number', step: 0.05 },
    { path: 'model.hostedAllowed', label: 'Hosted APIs allowed', kind: 'bool' },
  ] },
  { key: 'judge', title: 'Judge', fields: [
    { path: 'judge.rubricVersion', label: 'Rubric version', kind: 'text' },
    { path: 'judge.model', label: 'Judge model', kind: 'text' },
  ] },
  { key: 'scoring', title: 'Scoring (ADR-009; weights sum to 1)', fields: [
    { path: 'scoring.weights.correctness', label: 'Correctness weight', kind: 'number', step: 0.05 },
    { path: 'scoring.weights.tokenEfficiency', label: 'Token efficiency weight', kind: 'number', step: 0.05 },
    { path: 'scoring.weights.resourceEfficiency', label: 'Memory + runtime weight', kind: 'number', step: 0.05 },
    { path: 'scoring.weights.processQuality', label: 'Process quality weight', kind: 'number', step: 0.05 },
    { path: 'scoring.wrongSubmissionPenalty', label: 'Wrong submission penalty', kind: 'number' },
    { path: 'scoring.decayPerMinute', label: 'Decay per minute', kind: 'number', step: 0.1 },
  ] },
  { key: 'leaderboard', title: 'Leaderboard', fields: [{ path: 'leaderboard.projectorEnabled', label: 'Projector view enabled', kind: 'bool' }] },
  { key: 'access', title: 'Access', fields: [
    { path: 'access.sebRequired', label: 'Safe Exam Browser required', kind: 'bool' },
    { path: 'access.checkInCap', label: 'Check-in cap', kind: 'number' },
    { path: 'access.allowMinors', label: 'Minors allowed (guardian consent required)', kind: 'bool' },
  ] },
  { key: 'consent', title: 'Consent (ADR-010)', fields: [
    { path: 'consent.text', label: 'Consent text', kind: 'textarea' },
    { path: 'consent.retentionDays', label: 'Retention (days)', kind: 'number' },
  ] },
];

export const LIVE_SECTIONS = new Set(['budget', 'schedule']);

export function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** Immutable set of a dotted path. */
export function set<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const base = (obj ?? {}) as Record<string, unknown>;
  return { ...base, [head!]: rest.length ? set(base[head!], rest.join('.'), value) : value } as T;
}

/** datetime-local value (browser time) ↔ ISO with the browser's offset. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value: string): string {
  const d = new Date(value);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${value}:00${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

function nextSaturday(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(hour, 0, 0, 0);
  return fromLocalInput(toLocalInput(d.toISOString()));
}

/** A complete config a new event starts from (EventConfig's own defaults plus the required fields). */
export function defaultConfig(name: string): EventConfig {
  return {
    branding: { title: name },
    schedule: { checkInAt: nextSaturday(9), startsAt: nextSaturday(10), durationMinutes: 180, freezeMinutes: 30 },
    languages: ['c', 'cpp', 'java', 'python'],
    timeMultiplier: { c: 1, cpp: 1, java: 2, python: 3 },
    budget: { tokensPerParticipant: 60000, contextTokens: 8192, contextWarnPercent: 80, maxPromptChars: 4000, replyTokens: 1024 },
    model: { baseUrl: 'http://gateway.invalid', name: 'junior', systemPromptVersion: 'v1', temperature: 0.2, hostedAllowed: false },
    judge: { rubricVersion: 'v1', model: 'gpt-oss:120b' },
    scoring: { weights: { correctness: 0.55, tokenEfficiency: 0.15, resourceEfficiency: 0.1, processQuality: 0.2 }, wrongSubmissionPenalty: 50, decayPerMinute: 2 },
    leaderboard: { projectorEnabled: true },
    access: { sebRequired: true, checkInCap: 40, allowMinors: false },
    consent: { text: 'I agree that my prompts, replies and code are logged and judged. Traffic passes through Cloudflare.', retentionDays: 30 },
  };
}
