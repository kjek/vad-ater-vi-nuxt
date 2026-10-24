import type { Page } from '@playwright/test';

export async function mockAuth(page: Page) {
  await page.route('**/api/auth**', async (route) => {
    await route.fulfill({
      status: 200,
    });
  });
}
