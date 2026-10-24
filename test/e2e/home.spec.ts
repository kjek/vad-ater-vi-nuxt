import { test, expect } from 'vitest';
import { chromium } from 'playwright-core';

const BASE_URL = 'http://localhost:3000';

test('Home page loads and displays restaurants', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(BASE_URL);

  const heading = page.locator('h1');
  expect(await heading.textContent()).toMatch(/lunch i sundsvall/i);

  const restaurants = page.locator('[data-test="lunch-item"]');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(await restaurants.count()).toBeGreaterThan(0);

  await browser.close();
});

test('Can navigate to admin page', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${BASE_URL}/admin`);

  expect(page.url()).toMatch(/\/login/);

  await browser.close();
});
