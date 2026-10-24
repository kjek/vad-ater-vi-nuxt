// crawler.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPage } from '../../server/scrapers/crawler';

const { goto, waitForTimeout, content, innerText, locator, newPage, launch } = vi.hoisted(() => ({
  goto: vi.fn(),
  waitForTimeout: vi.fn(),
  content: vi.fn(),
  innerText: vi.fn(),
  locator: vi.fn(),
  newPage: vi.fn(),
  launch: vi.fn(),
}));

vi.mock('playwright', () => ({
  chromium: {
    launch,
  },
}));

describe('fetchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    launch.mockResolvedValue({
      newPage,
    });

    newPage.mockResolvedValue({
      goto,
      waitForTimeout,
      content,
      locator,
    });

    goto.mockResolvedValue(undefined);
    waitForTimeout.mockResolvedValue(undefined);
    content.mockResolvedValue('<html><body>Lunch</body></html>');
    locator.mockReturnValue({
      innerText,
    });
    innerText.mockResolvedValue('Lunch');
  });

  it('launches Chromium with the expected page configuration', async () => {
    const result = await fetchPage('https://example.com/menu');

    expect(launch).toHaveBeenCalledWith({
      headless: true,
    });

    expect(newPage).toHaveBeenCalledWith({
      viewport: {
        width: 1400,
        height: 900,
      },
    });

    expect(goto).toHaveBeenCalledWith('https://example.com/menu');

    expect(waitForTimeout).toHaveBeenCalledWith(1000);
    expect(locator).toHaveBeenCalledWith('body');

    expect(result).toEqual({
      browser: expect.any(Object),
      page: expect.any(Object),
      url: 'https://example.com/menu',
      html: '<html><body>Lunch</body></html>',
      visibleText: 'Lunch',
    });
  });

  it('returns the browser and page without closing the browser', async () => {
    const browser = await launch();
    const page = await newPage();

    const result = await fetchPage('https://example.com/menu');

    expect(result.browser).toBe(browser);
    expect(result.page).toBe(page);
  });
});
