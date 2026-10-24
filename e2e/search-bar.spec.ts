import { test, expect } from '@playwright/test';
import { mockRestaurants } from './__fixtures__/mock-restaurants';
import { mockAuth } from './__fixtures__/mock-auth';

test.beforeEach(async ({ page }) => {
  await mockAuth(page);
  await mockRestaurants(page);
});

test('has title', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  await expect(page).toHaveTitle(/Vad Äter Vi | Vad Äter Vi/);
});

test('has search bar', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const search = page.getByRole('textbox', { name: 'Sök' });

  await search.fill('pizza');

  await expect(search).toHaveValue('pizza');

  await expect(page.getByText('Pizza Palace')).toBeVisible();
});

test('search filters restaurants', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  // Make sure the mocked data actually loaded
  await expect(page.getByText('Pizza Palace')).toBeVisible();
  await expect(page.getByText('Sushi House')).toBeVisible();
  await expect(page.getByText('Burger Bar')).toBeVisible();
  await expect(page.getByText('Burger Castle')).toBeVisible();

  const search = page.getByRole('textbox', { name: 'Sök' });

  // First search
  await search.fill('bur');

  await expect(search).toHaveValue('bur');

  await expect(page.getByText('Burger Bar')).toBeVisible();
  await expect(page.getByText('Burger Castle')).toBeVisible();

  // Second search
  await search.fill('burger bar');

  await expect(search).toHaveValue('burger bar');

  await expect(page.getByText('Burger Castle')).not.toBeVisible();
  await expect(page.getByText('Burger Bar')).toBeVisible();
});
