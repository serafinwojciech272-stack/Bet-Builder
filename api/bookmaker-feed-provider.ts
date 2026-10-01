import type { BookmakerFeedProvider } from '../src/providers/bookmakerFeed.js';
import { fetchPolishBookmakerDataset } from './polish-bookmaker-feed.js';
import { arbiScanBookmakerProvider } from './arbiscan-bookmaker-provider.js';

export const oddsApiIoBookmakerProvider: BookmakerFeedProvider = {
  id: 'odds-api.io',
  capabilities: ['STS', 'Superbet'],
  isConfigured: () => Boolean(process.env.ODDS_API_IO_KEY?.trim()),
  fetch: request =>
    fetchPolishBookmakerDataset(request.date, request.sport, request.bookmakers),
};

export function getBookmakerFeedProviders(): readonly BookmakerFeedProvider[] {
  return [oddsApiIoBookmakerProvider, arbiScanBookmakerProvider];
}
