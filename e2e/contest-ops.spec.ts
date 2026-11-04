/**
 * WP-05 acceptance (WP-08 task 1): contest controls end to end. Pause stops a participant, resume restarts them;
 * extend adds time for everyone; the projector board freezes in the last minutes. Drafted by FORGE, fixed in review.
 */
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { EventConfig } from '@codehaunt/contracts';
import { createPrismaClient } from '@codehaunt/db';

// Helper to load state
const state = () =>
  JSON.parse(readFileSync(new URL('./.state.json', import.meta.url), 'utf8')) as {
    password: string;
    users: Record<string, string>;
    admin: string;
    eventId: string;
  };

// Simple sign‑in used by admin and participant pages.
async function signIn(page: Page, username: string, password: string, expectRefusal = false) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  const answered = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await answered;
  if (!expectRefusal) await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

// Parse a "h:mm:ss" string into seconds.
function parseHMS(text: string): number {
  const [h = 0, m = 0, s = 0] = text.trim().split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

test.describe.serial('contest operations', () => {
  const { admin, password, users, eventId } = state();
  const participantUser = users['python']!;
  let participantPage: Page;

  test('pause stops the participant and resume restarts them', async ({ page, browser }) => {
    // Admin pauses the contest.
    await signIn(page, admin, password);
    await page.goto(`/admin/contest?event=${eventId}`);
    await page.getByRole('radio', { name: /^Pause/ }).click();
    await page.locator('#control-reason').fill('e2e: pause check');
    await page.getByRole('button', { name: 'Apply: Pause' }).click();
    await expect(page.getByText('paused', { exact: true })).toBeVisible();

    // Participant sees the paused message.
    participantPage = await browser.newPage();
    await signIn(participantPage, participantUser, password);
    await expect(participantPage.getByText('Paused by the organizers.')).toBeVisible();

    // Admin resumes.
    await page.getByRole('radio', { name: 'Resume' }).click();
    await page.locator('#control-reason').fill('e2e: resume after pause');
    await page.getByRole('button', { name: 'Apply: Resume' }).click();
    await expect(page.getByText('running', { exact: true })).toBeVisible();

    // Participant no longer sees paused text after reload.
    await participantPage.reload();
    await expect(participantPage.getByText('Paused by the organizers.')).toBeHidden();
  });

  test('extend adds time for everyone', async ({ page }) => {
    await signIn(page, admin, password);
    await page.goto(`/admin/contest?event=${eventId}`);
    // read current time left
    const timeLeftText = await page
      .locator('text=Time left')
      .locator('xpath=following-sibling::*[1]')
      .innerText();
    const beforeSec = parseHMS(timeLeftText);

    // extend 15 minutes
    await page.locator('#extend-value').fill('15');
    await page.locator('#extend-reason').fill('e2e: extend test');
    await page.getByRole('button', { name: 'Extend for everyone' }).click();
    await expect(page.getByText('Extend for everyone: done.')).toBeVisible();

    const afterText = await page
      .locator('text=Time left')
      .locator('xpath=following-sibling::*[1]')
      .innerText();
    const afterSec = parseHMS(afterText);
    expect(afterSec).toBeGreaterThanOrEqual(beforeSec + 14 * 60);
  });

  test('the projector freezes in the last minutes', async ({ page }) => {
    const prisma = createPrismaClient();
    const tag = Date.now().toString(36);
    const slug = `e2e-freeze-${tag}`;
    const now = new Date();
    const config = EventConfig.parse({
      branding: { title: 'Freeze Test' },
      schedule: {
        checkInAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
        startsAt: new Date(now.getTime() - 55 * 60 * 1000).toISOString(), // 55m ago
        durationMinutes: 60,
        freezeMinutes: 10,
      },
      model: { baseUrl: process.env.GATEWAY_URL ?? 'http://gateway.invalid', name: 'junior', systemPromptVersion: 'tutor-v1' },
      judge: { rubricVersion: 'v1' },
      consent: { text: 'I agree that my prompts, replies and code are logged and judged.' },
    });

    const event = await prisma.event.create({
      data: { slug, name: `Freeze ${tag}`, status: 'RUNNING', config, lockedAt: new Date(now.getTime() - 55 * 60 * 1000) },
    });
    await prisma.$disconnect();

    // Admin creates projector link.
    await signIn(page, admin, password);
    const resp = await page.request.post(`/api/admin/ops/events/${event.id}/projector`, {
      data: { reason: 'e2e freeze test' },
    });
    expect(resp.ok()).toBe(true);
    const projectorPath = ((await resp.json()) as { path: string }).path;
    await page.goto(projectorPath);
    await expect(page.getByText('Board frozen')).toBeVisible();
  });
});
