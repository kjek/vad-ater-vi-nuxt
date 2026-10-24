import type { LunchMenu, WeekMenu } from '~/types/lunch-menu';

type Scraper = (
  lunchUrl: string,
  debug?: boolean
) => Promise<LunchMenu[] | WeekMenu | string | undefined>;

export default Scraper;
