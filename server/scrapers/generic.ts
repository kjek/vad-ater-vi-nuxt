import type { LunchMenu } from '~/types/lunch-menu';
import type Scraper from '../types/scraper';
import { fetchPage } from './crawler';
import { parseMenu } from './parser';

const genericWebScraper: Scraper = async (lunchUrl, debug) => {
  console.time(`Generic scraper for ${lunchUrl}`);

  try {
    const crawled = await fetchPage(lunchUrl);

    const menu = await parseMenu(crawled.visibleText);

    await crawled.browser.close();

    const lunchMenu = menu.days.map((data) => {
      return {
        day: data.day,
        food: data.dishes.map((dish) => dish.name).join('\n'),
      } as LunchMenu;
    });

    if (debug) {
      console.log('[SCRAPER DEBUG] Lunch menu:', lunchMenu);
    }

    return lunchMenu;
  } catch (error) {
    console.error(`[ERROR]: ${error}`);
  } finally {
    console.timeEnd(`Generic scraper for ${lunchUrl}`);
  }
};

export default genericWebScraper;
