import { chromium, type Page, type Browser } from 'playwright';

export interface CrawledPage {
  browser: Browser;
  page: Page;
  url: string;
  html: string;
  visibleText: string;
}

export async function fetchPage(url: string): Promise<CrawledPage> {
  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage({
    viewport: {
      width: 1400,
      height: 900,
    },
  });

  await page.goto(url);

  await page.waitForTimeout(1000);

  return {
    browser,
    page,
    url,
    html: await page.content(),
    visibleText: await page.locator('body').innerText(),
  };
}
