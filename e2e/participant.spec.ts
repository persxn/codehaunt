/**
 * WP-03 acceptance as changed by ADR-033, end to end: login → consent → type the solution → paste does nothing → ask
 * the tutor (the code is unchanged, the reply can't be copied) → sample run → submit → Accepted, in all four
 * languages, against the live model. Meters equal the ledger; no response the participant receives contains a
 * hidden test.
 */
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { createPrismaClient, tokenBalance } from '@codehaunt/db';

const state = () => JSON.parse(readFileSync(new URL('./.state.json', import.meta.url), 'utf8')) as {
  password: string; users: Record<string, string>; admin: string;
};
const HIDDEN = /987654321|123456788|1111111109|999999937|999999938/;

/** Typed key by key; no line starts with indentation, because Enter keeps the previous line's indent. */
export const SOLUTIONS: Record<string, string> = {
  c: '#include <stdio.h>\nint main(void) { long long a, b; scanf("%lld %lld", &a, &b); printf("%lld\\n", a + b); return 0; }\n',
  cpp: '#include <iostream>\nint main() { long long a, b; std::cin >> a >> b; std::cout << a + b << "\\n"; return 0; }\n',
  java: 'import java.util.*;\npublic class Main { public static void main(String[] x) { Scanner s = new Scanner(System.in); long a = s.nextLong(), b = s.nextLong(); System.out.println(a + b); } }\n',
  python: 'a, b = map(int, input().split())\nprint(a + b)\n',
};
const LANGUAGE_LABEL: Record<string, string> = { c: 'C', cpp: 'C++', java: 'Java', python: 'Python 3' };

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/contest');
}

for (const lang of ['c', 'cpp', 'java', 'python']) {
  test(`type → paste blocked → ask the tutor → sample → submit → Accepted (${lang})`, async ({ page, context }) => {
    const { users, password } = state();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
    await page.getByLabel('Language').selectOption(lang);
    const editor = page.getByLabel(`Your ${LANGUAGE_LABEL[lang]} code`);
    await editor.click();
    await page.keyboard.type(SOLUTIONS[lang]!);
    await expect(editor).toHaveValue(SOLUTIONS[lang]!);

    // A real clipboard paste and a drop change nothing (ADR-033).
    await page.evaluate(() => navigator.clipboard.writeText('PASTED_TEXT();'));
    await page.keyboard.press('Control+V');
    await editor.dispatchEvent('drop', { dataTransfer: await page.evaluateHandle(() => { const d = new DataTransfer(); d.setData('text/plain', 'DROPPED();'); return d; }) });
    await expect(editor).toHaveValue(SOLUTIONS[lang]!);
    const question = page.getByLabel('Question for the tutor');
    await expect(page.getByText(/Saved \d/)).toBeVisible({ timeout: 30_000 });

    // Ask the tutor; the reply arrives and the code stays exactly as typed.
    await question.click();
    await page.keyboard.press('Control+V');
    await expect(question).toHaveValue('');
    await page.keyboard.type('Why can an int overflow when adding two numbers near 10^9?');
    await page.getByRole('button', { name: 'Send' }).click();
    const reply = page.getByRole('region', { name: 'Ask the tutor' }).locator('ol li').last().locator('div').last();
    // The question box clears when the reply is done; then the turn's reply is on screen.
    await expect(question).toHaveValue('', { timeout: 90_000 });
    await expect(reply).not.toHaveText(/thinking/i, { timeout: 90_000 });
    await expect(reply).not.toBeEmpty();
    await expect(editor).toHaveValue(SOLUTIONS[lang]!);
    const copied = await reply.evaluate((el) => el.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true })));
    expect(copied, 'copying a reply is prevented').toBe(false);

    await page.getByRole('button', { name: 'Run samples' }).click();
    await expect(page.getByText('Sample run').first()).toBeVisible();
    await expect(page.locator('li', { hasText: 'Sample run' }).first().getByText('Accepted').first()).toBeVisible({ timeout: 120_000 });

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('li', { hasText: 'Submission' }).first().getByText('Accepted').first()).toBeVisible({ timeout: 120_000 });

    // The meters match the ledger: tokens used = grants − SUM(delta); context = the last turn's prompt + reply.
    // The tutor got the question and no code.
    const prisma = createPrismaClient();
    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { username: users[lang]! }, include: { participants: true } });
      const participantId = user.participants[0]!.id;
      const grants = await prisma.tokenLedger.aggregate({ where: { participantId, kind: 'GRANT' }, _sum: { delta: true } });
      const used = (grants._sum.delta ?? 0) - (await tokenBalance(prisma, participantId));
      const turn = await prisma.promptTurn.findFirstOrThrow({ where: { chatSession: { participantId } }, orderBy: { createdAt: 'desc' } });
      expect(turn.prompt).not.toContain('current_code');
      const versions = await prisma.codeVersion.findMany({ where: { chatSession: { participantId } } });
      expect(versions.every((v) => v.promptTurnId === null && !v.source.includes('PASTED') && !v.source.includes('DROPPED'))).toBe(true);
      await page.reload();
      await expect(page.getByRole('meter', { name: 'Tokens' })).toHaveAttribute('aria-valuenow', String(used));
      expect(used).toBe(turn.promptTokens + turn.completionTokens);
      await page.getByRole('button', { name: /Sum of two integers/ }).click();
      await expect(page.getByRole('meter', { name: 'Context' })).toHaveAttribute('aria-valuenow', String(turn.promptTokens + turn.completionTokens));
      await expect(page.getByLabel(`Your ${LANGUAGE_LABEL[lang]} code`)).toHaveValue(SOLUTIONS[lang]!);
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
