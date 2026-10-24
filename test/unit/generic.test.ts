// generic.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import genericWebScraper from '../../server/scrapers/generic';

const { fetchPage, parseMenu, close, getConfiguration } = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  parseMenu: vi.fn(),
  close: vi.fn(),
  getConfiguration: vi.fn(),
}));

vi.mock('../../server/scrapers/crawler', () => ({
  fetchPage,
}));

vi.mock('../../server/scrapers/parser', () => ({
  parseMenu,
}));

vi.mock('~~/server/helpers/admin-db-helper', () => ({
  getConfiguration,
}));

describe('genericWebScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    close.mockResolvedValue(undefined);

    fetchPage.mockResolvedValue({
      browser: {
        close,
      },
      page: {},
      url: 'https://example.com/menu',
      html: '<html />',
      visibleText: 'menu',
    });

    parseMenu.mockResolvedValue({
      raw: 'best candidate',
      days: [
        {
          day: 'Måndag',
          date: '06/07',
          dishes: [{ name: 'Köttbullar' }, { name: 'Potatis' }],
        },
        {
          day: 'Tisdag',
          date: '07/07',
          dishes: [{ name: 'Pasta' }],
        },
      ],
    });

    getConfiguration.mockResolvedValue({
      key: '',
      value: '',
    });
  });

  it('runs the scraping pipeline and maps parsed dishes to lunch menus', async () => {
    const result = await genericWebScraper('https://example.com/menu');

    expect(fetchPage).toHaveBeenCalledWith('https://example.com/menu');
    expect(close).toHaveBeenCalledOnce();
    expect(parseMenu).toHaveBeenCalledOnce();

    expect(result).toEqual([
      {
        day: 'Måndag',
        food: 'Köttbullar\nPotatis',
      },
      {
        day: 'Tisdag',
        food: 'Pasta',
      },
    ]);
  });

  it('returns the mapped menu in debug mode', async () => {
    const result = await genericWebScraper('https://example.com/menu', true);

    expect(fetchPage).toHaveBeenCalledOnce();
    expect(parseMenu).toHaveBeenCalledOnce();

    expect(result).toEqual([
      {
        day: 'Måndag',
        food: 'Köttbullar\nPotatis',
      },
      {
        day: 'Tisdag',
        food: 'Pasta',
      },
    ]);
  });

  it('returns undefined when fetching the page fails', async () => {
    fetchPage.mockRejectedValue(new Error('Network error'));

    const result = await genericWebScraper('https://example.com/menu');

    expect(fetchPage).toHaveBeenCalledOnce();
    expect(result).toBeUndefined();
  });

  it('returns undefined when parsing the menu fails', async () => {
    parseMenu.mockRejectedValue(new Error('Parse error'));

    const result = await genericWebScraper('https://example.com/menu');

    expect(fetchPage).toHaveBeenCalledOnce();
    expect(result).toBeUndefined();
  });
});
