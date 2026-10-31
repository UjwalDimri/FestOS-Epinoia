import { test, expect } from '@playwright/test';

async function signIn(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Festival Director' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('DEMO DATA, not persisted')).toBeVisible();
}

test('demo sign-in, dashboard and read-only schedule conflict view', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Demo bed shortfall')).toBeVisible();
  await page.getByRole('button', { name: 'Accommodation & schedule' }).click();
  await expect(page.getByText('Active schedule (read-only)')).toBeVisible();
  await expect(page.getByText(/participant_clash/)).toBeVisible();
  await expect(page.getByText('Events and venues · read-only')).toBeVisible();
});

test('disruption preview requires confirmation and returns a demo result', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Disruptions' }).click();
  await page.getByRole('button', { name: 'Preview impact' }).click();
  await expect(page.getByText(/Impact preview/)).toBeVisible();
  await page.getByLabel(/Reason for committing/).fill('E2E demo walkthrough');
  await page.getByRole('button', { name: 'Review and commit' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Commit change' }).click();
  await expect(page.getByText(/Demo commit recorded/)).toBeVisible();
});

test('audit view shows the API-shaped verification fixture', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Audit' }).click();
  await expect(page.getByText('Audit verification response')).toBeVisible();
  await expect(page.locator('pre')).toContainText('"ok": true');
});

test('staff view shows synthetic shift coverage and roster', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Staff & shifts' }).click();
  await expect(page.getByText('Shift coverage by role')).toBeVisible();
  await expect(page.getByText('Aarav Demo')).toBeVisible();
  await expect(page.getByText('00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00, 07:00')).toBeVisible();
});

test('tablet navigation stays available and the commit dialog manages focus', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Audit' })).toBeVisible();
  await page.getByRole('button', { name: 'Disruptions' }).click();
  await page.getByRole('button', { name: 'Preview impact' }).click();
  await expect(page.getByText(/Impact preview/)).toBeVisible();
  await page.getByLabel(/Reason for committing/).fill('Keyboard flow check');
  const review = page.getByRole('button', { name: 'Review and commit' });
  await review.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Commit change' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(review).toBeFocused();
});
