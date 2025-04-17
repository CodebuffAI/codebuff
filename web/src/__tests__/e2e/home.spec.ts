import { expect, test } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Codebuff/);
});

test('renders main sections', async ({ page }) => {
  await page.goto('/');
  
  // Wait for the main content to be visible
  await page.waitForSelector('main');
  
  // Check for key elements
  await expect(page.getByRole('heading', { name: /Supercharge/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Your Codebase/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Direct Your Codebase/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Better and Better Over Time/i })).toBeVisible();
});
