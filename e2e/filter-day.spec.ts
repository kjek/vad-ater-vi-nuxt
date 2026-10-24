import { test, expect } from '@playwright/test';
import { mockRestaurants } from './__fixtures__/mock-restaurants';
import { mockAuth } from './__fixtures__/mock-auth';

test.beforeEach(async ({ page }) => {
  await mockAuth(page);
  await mockRestaurants(page);
});

test('user can select a day', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const dayList = page.locator('#day-button-list');
  await expect(dayList).toBeVisible();

  const tuesday = dayList.getByRole('button', { name: 'Tisdag' });

  await expect(tuesday).toBeVisible();
  await expect(tuesday).toBeEnabled();

  await tuesday.click();

  await expect(tuesday).toContainClass('focus-visible:ring-primary');
  await expect(page.getByText('Azteka')).toBeVisible();
});

test('user can select every day', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const dayList = page.locator('#day-button-list');
  await expect(dayList).toBeVisible();

  const week = dayList.getByRole('button', { name: 'Hela veckan' });

  await expect(week).toBeVisible();
  await expect(week).toBeEnabled();

  await week.click();

  const dayButtons = page.locator('#day-button-list button').filter({
    hasText: /^(Måndag|Tisdag|Onsdag|Torsdag|Fredag)$/,
  });

  for (const button of await dayButtons.all()) {
    await expect(button).toContainClass('focus-visible:ring-primary');
  }

  await expect(page.getByText('Kebab pizza')).toBeVisible();
  await expect(page.getByText('Azteka')).toBeVisible();
});
