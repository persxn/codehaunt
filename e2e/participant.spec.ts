/**
 * WP-03 acceptance, end to end: login → consent → prompt → code appears → sample run → submit → Accepted, in all four
 * languages, against the live model. Also: the code view takes no typing or pasting, and no response the participant
 * receives contains a hidden test.
 */
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { createPrismaClient, tokenBalance } from '@codehaunt/db';

const state = () => JSON.parse(readFileSync(new URL('./.state.json', import.meta.url), 'utf8')) as {
  password: string; users: Record<string, string>; admin: string;
};
const HIDDEN = /987654321|123456788|1111111109|999999937|999999938/;
const LABEL: Record<string, string> = { c: 'c', cpp: 'cpp', java: 'java', python: 'python' };

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/contest');
}

for (const lang of ['c', 'cpp', 'java', 'python']) {
  test(`prompt → code → sample → submit → Accepted (${lang})`, async ({ page }) => {
    const { users, password } = state();
    const leaks: string[] = [];
    page.on('response', async (response) => {
      if (!response.url().includes('/api/')) return;
      const body = await response.text().catch(() => '');
      if (HIDDEN.test(body)) leaks.push(`${response.url()}: ${body.slice(0, 200)}`);
    });

    await signIn(page, users[lang]!, password);
    await page.getByRole('checkbox', { name: 'I agree' }).check();
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: /Sum of two integers/ }).click();
    await page.getByLabel('Language').selectOption(LABEL[lang]!);
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByLabel('Instruction to the model').fill(
      'Write a complete program that reads two integers a and b given on ONE line separated by a space from standard input (they can be as large as 10^9 in absolute value, so use a 64-bit integer type) and prints a + b followed by a newline.' +
        (lang === 'java' ? ' Name the class Main.' : ''),
    );
    await page.getByRole('button', { name: 'Send' }).click();
    const code = page.getByRole('region', { name: 'Current code (read-only)' });
    await expect(code).toBeVisible({ timeout: 90_000 });
    const before = await code.innerText();

    // Read-only: no editable element; typing and pasting change nothing.
    await expect(code.locator('input, textarea, [contenteditable="true"], [contenteditable=""]')).toHaveCount(0);
    await code.click();
    await page.keyboard.type('int hacked = 1;');
    await page.evaluate(() => {
      const target = document.querySelector('[aria-label="Current code (read-only)"]')!;
      const data = new DataTransfer();
      data.setData('text/plain', 'pasted();');
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    expect(await code.innerText()).toBe(before);

    await page.getByRole('button', { name: 'Run samples' }).click();
    await expect(page.getByText('Sample run').first()).toBeVisible();
    await expect(page.locator('li', { hasText: 'Sample run' }).first().getByText('Accepted').first()).toBeVisible({ timeout: 120_000 });

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('li', { hasText: 'Submission' }).first().getByText('Accepted').first()).toBeVisible({ timeout: 120_000 });

    // The meters match the ledger: tokens used = grants − SUM(delta); context = the last turn's prompt + reply.
    const prisma = createPrismaClient();
    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { username: users[lang]! }, include: { participants: true } });
      const participantId = user.participants[0]!.id;
      const grants = await prisma.tokenLedger.aggregate({ where: { participantId, kind: 'GRANT' }, _sum: { delta: true } });
      const used = (grants._sum.delta ?? 0) - (await tokenBalance(prisma, participantId));
      const turn = await prisma.promptTurn.findFirstOrThrow({ where: { chatSession: { participantId } }, orderBy: { createdAt: 'desc' } });
      await page.reload();
      await expect(page.getByRole('meter', { name: 'Tokens' })).toHaveAttribute('aria-valuenow', String(used));
      expect(used).toBe(turn.promptTokens + turn.completionTokens);
      await page.getByRole('button', { name: /Sum of two integers/ }).click();
      await expect(page.getByRole('meter', { name: 'Context' })).toHaveAttribute('aria-valuenow', String(turn.promptTokens + turn.completionTokens));
    } finally {
      await prisma.$disconnect();
    }
    expect(leaks).toEqual([]);
  });
}

test('a weak new password is refused with a plain-language reason', async ({ page }) => {
  const { users, password } = state();
  await signIn(page, users.c!, password);
  await page.goto('/account');
  for (const [weak, reason] of [
    ['short1', /at least 12 characters/],
    ['password1234', /too common or too simple/],
    [`${users.c}-xyz-123`, /must not contain your username/],
  ] as const) {
    await page.getByLabel('Current password').fill(password);
    await page.getByLabel('New password', { exact: true }).fill(weak);
    await page.getByLabel('Repeat new password').fill(weak);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.locator('form').getByRole('alert')).toContainText(reason);
  }
});

test('the system check page is public and runs', async ({ page }) => {
  await page.goto('/system-check');
  await page.getByRole('button', { name: 'Run check' }).click();
  await expect(page.getByText(/Connection: (OK|Check)/)).toBeVisible();
});
