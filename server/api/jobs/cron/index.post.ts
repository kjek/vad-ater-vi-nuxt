import { handleLunchScrapers } from '~~/server/helpers/scraper-helper';

export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'x-cron-token');

  if (!token || token !== process.env.CRON_TOKEN) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  await handleLunchScrapers();

  return { success: true };
});
