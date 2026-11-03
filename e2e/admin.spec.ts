/**
 * WP-04 acceptance, end to end: an admin creates an event with two problems entirely in the UI; participants are
 * imported, get badges, can't sign in until checked in; the check-in code works once; a participant solves a problem;
 * a live budget change reaches the participant; staff rules (volunteer pages, add/remove, weak passwords).
 */
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { createPrismaClient } from '@codehaunt/db';

const state = () => JSON.parse(readFileSync(new URL('./.state.json', import.meta.url), 'utf8')) as { password: string; admin: string };
const tag = Date.now().toString(36);
const slug = `ui-${tag}`;

/** Signs in and waits until the app has left /login (unless the sign-in is expected to be refused). */
async function signIn(page: Page, username: string, password: string, expectRefusal = false) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  const answered = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await answered;
  if (!expectRefusal) await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function addProblem(page: Page, p: { slug: string; title: string; ref: string }) {
  await page.getByRole('button', { name: 'New problem' }).click();
  const form = page.getByRole('form', { name: 'New problem' });
  await form.getByLabel('Short name (a-z, 0-9, -)').fill(p.slug);
  await form.getByLabel('Title').fill(p.title);
  await form.getByLabel(/^Statement/).fill(`Read two integers on one line and print ${p.title.toLowerCase()}.`);
  await form.getByLabel('Input 1').first().fill('3 4');
  await form.getByLabel('Expected output 1').first().fill(p.slug === 'sum' ? '7' : '12');
  await form.getByLabel('Input 1').nth(1).fill('100000 300000');
  await form.getByLabel('Expected output 1').nth(1).fill(p.slug === 'sum' ? '400000' : '30000000000');
  await form.getByLabel('Python 3 · reference (must pass)').fill(p.ref);
  await form.getByRole('button', { name: 'Save problem' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
}

test.describe.serial('admin console', () => {
  let eventId = '';
  const badges: Array<{ username: string; password: string; checkInCode: string }> = [];

  test('an admin creates an event with two problems in the UI and calibrates one', async ({ page }) => {
    const { admin, password } = state();
    await signIn(page, admin, password);
    await page.goto('/admin/event');
    await page.getByLabel('Short name (a-z, 0-9, -)').fill(slug);
    await page.getByLabel('Event name').first().fill(`UI event ${tag}`);
    await page.getByRole('button', { name: 'New event' }).click();
    await page.waitForURL(/event=/);
    eventId = new URL(page.url()).searchParams.get('event')!;
    // Edit config: a small budget, cap 5, saved with a reason.
    await page.getByLabel('Tokens per participant').fill('20000');
    await page.getByLabel('Check-in cap').fill('5');
    await page.getByLabel('Reason for the change (kept in the audit log)').fill('e2e setup');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();

    await page.goto(`/admin/problems?event=${eventId}`);
    await addProblem(page, { slug: 'sum', title: 'Sum', ref: 'a,b=map(int,input().split());print(a+b)' });
    await addProblem(page, { slug: 'product', title: 'Product', ref: 'a,b=map(int,input().split());print(a*b)' });
    await expect(page.getByRole('row', { name: /Sum/ })).toContainText('1 / 1');
    await expect(page.getByRole('row', { name: /Product/ })).toBeVisible();

    await page.getByRole('row', { name: /Sum/ }).getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('button', { name: /Calibrate/ }).click();
    await expect(page.getByRole('region', { name: 'Calibration' }).getByText('as expected')).toBeVisible({ timeout: 120_000 });
  });

  test('import, badges, inactive until scanned, single-use check-in', async ({ page, browser }) => {
    const { admin, password } = state();
    await signIn(page, admin, password);
    await page.goto(`/admin/participants?event=${eventId}`);
    for (const i of [1, 2]) {
      await page.getByLabel('Name', { exact: true }).fill(`UI Person ${i}`);
      await page.getByLabel('Enrolment number').fill(`UI${tag}P${i}`);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Added 1');
    }
    // The event leaves DRAFT for check-in (WP-05 adds the controls; until then set directly).
    const prisma = createPrismaClient();
    await prisma.event.update({ where: { id: eventId }, data: { status: 'CHECK_IN' } });

    await page.goto(`/admin/badges?event=${eventId}`);
    page.once('dialog', (d) => d.accept());
    const issued = page.waitForResponse((r) => r.url().endsWith('/api/admin/badges'));
    await page.getByRole('button', { name: 'Issue badges' }).click();
    badges.push(...(await (await issued).json()).badges);
    await expect(page.getByRole('img', { name: 'Check-in code' })).toHaveCount(2);

    const p = await browser.newPage();
    await signIn(p, badges[0]!.username, badges[0]!.password, true);
    await expect(p.getByRole('alert').filter({ hasText: /not active yet/ })).toBeVisible();

    await page.goto(`/admin/checkin?event=${eventId}`);
    await page.getByLabel('Seat label').fill('B-7');
    await page.getByLabel('Type the code').fill(badges[0]!.checkInCode);
    await page.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByText('B-7')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Type the code').fill(badges[0]!.checkInCode);
    await page.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /not valid or was already used/ })).toBeVisible();

    await signIn(p, badges[0]!.username, badges[0]!.password);
    await p.waitForURL('**/contest');
    await prisma.$disconnect();
  });

  test('the participant solves a problem; a live budget change reaches them', async ({ page, browser }) => {
    const prisma = createPrismaClient();
    await prisma.event.update({ where: { id: eventId }, data: { status: 'RUNNING', lockedAt: new Date() } });
    const cfg = (await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).config as { schedule: Record<string, unknown> };
    await prisma.event.update({ where: { id: eventId }, data: { config: { ...cfg, schedule: { ...cfg.schedule, startsAt: new Date(Date.now() - 60_000).toISOString() } } } });
    await prisma.$disconnect();

    await signIn(page, badges[0]!.username, badges[0]!.password);
    await page.waitForURL('**/contest');
    await page.getByRole('checkbox', { name: 'I agree' }).check();
    await page.getByRole('button', { name: 'Accept' }).click();
    await page.getByRole('button', { name: /Sum/ }).click();
    await page.getByLabel('Language').selectOption('python');
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByLabel('Instruction to the model').fill('Write a program that reads two integers given on ONE line separated by a space and prints their sum.');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('region', { name: 'Current code (read-only)' })).toBeVisible({ timeout: 90_000 });
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('li', { hasText: 'Submission' }).first().getByText('Accepted').first()).toBeVisible({ timeout: 120_000 });

    // Admin raises the budget during the contest; the participant's total follows.
    const adminPage = await browser.newPage();
    const { admin, password } = state();
    await signIn(adminPage, admin, password);
    await adminPage.goto(`/admin/event?event=${eventId}`);
    await expect(adminPage.getByRole('note')).toContainText('Locked');
    await expect(adminPage.getByLabel('Check-in cap')).toBeDisabled();
    await adminPage.getByLabel('Tokens per participant').fill('25000');
    await adminPage.getByLabel('Reason for the change (kept in the audit log)').fill('extra tokens for everyone');
    await adminPage.getByRole('button', { name: 'Save' }).click();
    await expect(adminPage.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('meter', { name: 'Tokens' })).toHaveAttribute('aria-valuemax', '25000');
  });

  test('staff: volunteers reach only their pages; add and remove take effect; weak passwords refused', async ({ page, browser }) => {
    const { admin, password } = state();
    await signIn(page, admin, password);
    await page.goto('/admin/staff');
    const form = page.getByRole('form', { name: 'Add staff' });
    await form.getByLabel('Username', { exact: true }).fill(`vol-${tag}`);
    await form.getByLabel('Name', { exact: true }).fill('UI Volunteer');
    await form.getByLabel('Email (for Cloudflare Access)').fill(`vol-${tag}@example.test`);
    await form.getByLabel('Password', { exact: true }).fill('password1234');
    await form.getByRole('button', { name: 'Add staff' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /too common or too simple/ })).toBeVisible();
    const volPassword = 'copper lantern 7 owl';
    await form.getByLabel('Password', { exact: true }).fill(volPassword);
    await form.getByRole('button', { name: 'Add staff' }).click();
    await expect(page.getByRole('status')).toContainText('added');

    const vol = await browser.newPage();
    await signIn(vol, `vol-${tag}`, volPassword);
    await vol.waitForURL('**/admin/checkin');
    expect((await vol.request.get('/admin/event')).status()).toBe(403);
    expect((await vol.request.get('/api/admin/staff')).status()).toBe(403);

    await page.getByRole('row').filter({ hasText: `vol-${tag}@example.test` }).getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('status')).toContainText('removed');
    expect((await vol.request.get('/api/staff/events')).status()).toBe(401);
  });
});
