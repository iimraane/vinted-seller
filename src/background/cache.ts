import type { Quote } from '../valuation/types';

/** A successful provider quote may be reused for exactly one day. */
export const QUOTE_TTL_MS = 24 * 60 * 60 * 1000;
/** @deprecated Use QUOTE_TTL_MS. Kept for callers compiled against older builds. */
export const REFRESH_MS = QUOTE_TTL_MS;

export class QuoteCache {
  constructor(private readonly read: (key: string) => Promise<Quote | undefined>, private readonly write: (key: string, quote: Quote) => Promise<void>, private readonly now = () => Date.now()) {}
  async getFresh(key: string): Promise<Quote | undefined> {
    const quote = await this.read(key);
    const now = this.now();
    return quote
      && typeof quote.provider === 'string' && quote.provider.trim().length > 0
      && Number.isFinite(quote.amount) && quote.amount > 0
      && Number.isFinite(quote.fetchedAt) && quote.fetchedAt <= now && now - quote.fetchedAt < QUOTE_TTL_MS
      ? quote : undefined;
  }
  set(key: string, quote: Quote): Promise<void> { return this.write(key, quote); }
}
