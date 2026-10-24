import type { Page } from '@playwright/test';
import type { Restaurant } from '../../app/types/lunch-menu';

const restaurants: Restaurant[] = [
  {
    name: 'Pizza Palace',
    menu: [
      { day: 'Måndag', food: 'Kebab pizza' },
      { day: 'Tisdag', food: 'Azteka' },
    ],
    weeklySpecials: [],
  },
  {
    name: 'Sushi House',
    menu: [
      { day: 'Måndag', food: 'Tempura rolls' },
      { day: 'Tisdag', food: 'Califonia rolls' },
    ],
    weeklySpecials: [],
  },
  {
    name: 'Burger Bar',
    menu: [
      { day: 'Måndag', food: 'Burger' },
      { day: 'Tisdag', food: 'Onion rings' },
    ],
    weeklySpecials: [],
  },
  {
    name: 'Burger Castle',
    menu: [
      { day: 'Måndag', food: 'Double cheese' },
      { day: 'Tisdag', food: 'No cheese' },
    ],
    weeklySpecials: [],
  },
];

export async function mockRestaurants(page: Page) {
  await page.route('**/api/restaurants/list**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(restaurants),
    });
  });
}
