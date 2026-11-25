import { expect, test } from '@playwright/test';

test.describe('paper trading smoke', () => {
  test('sign in, see live depth, and place a resting order', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('trader@tickbook.local');
    await page.getByLabel('Password').fill('tickbook-demo-pass');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Simulated venue · paper trading only')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Order book depth' })).toContainText('Spread');
    await expect(page.locator('.dot.live')).toBeVisible();

    await page.getByLabel(/Price/).fill('97.00');
    await page.getByLabel('Quantity').fill('10');
    await page.getByRole('button', { name: 'Buy TBK' }).click();
    await expect(page.getByRole('status')).toContainText('Order new');
    await expect(page.getByRole('table', { name: 'Order book depth' })).toContainText('97.00');

    await page
      .getByRole('button', { name: /Cancel order/ })
      .first()
      .click();
    await expect(page.getByRole('table', { name: 'Order book depth' })).not.toContainText('97.00');
  });

  test('planned sections are visible but marked as planned', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('viewer@tickbook.local');
    await page.getByLabel('Password').fill('tickbook-demo-pass');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('link', { name: /Surveillance/ }).click();
    await expect(page.getByRole('heading', { name: 'Surveillance' })).toBeVisible();
    await expect(page.getByText('Planned').first()).toBeVisible();
  });
});
