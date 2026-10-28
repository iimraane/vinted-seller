import { describe, expect, it } from 'vitest';
import { QuoteCache, REFRESH_MS } from './cache';

describe('QuoteCache', () => {
  it('expires intraday valuations after the configured refresh period', async () => {
    const cache = new QuoteCache(async () => ({ provider: 'x', amount: 100, fetchedAt: 1 }), async () => undefined, () => REFRESH_MS + 2);
    await expect(cache.getFresh('any')).resolves.toBeUndefined();
  });
  it('rejects future-dated and malformed stored timestamps', async () => {
    const now = 1_000;
    const future = new QuoteCache(async () => ({ provider: 'x', amount: 100, fetchedAt: now + 1 }), async () => undefined, () => now);
    const malformed = new QuoteCache(async () => ({ provider: 'x', amount: 100, fetchedAt: Number.NaN }), async () => undefined, () => now);
    await expect(future.getFresh('any')).resolves.toBeUndefined();
    await expect(malformed.getFresh('any')).resolves.toBeUndefined();
  });
  it('keeps a 23:59 quote but refreshes one that is exactly 24 hours old', async () => {
    const now = REFRESH_MS;
    const fresh = new QuoteCache(async () => ({ provider: 'x', amount: 100, fetchedAt: now - REFRESH_MS + 60_000 }), async () => undefined, () => now);
    const stale = new QuoteCache(async () => ({ provider: 'x', amount: 100, fetchedAt: 0 }), async () => undefined, () => now);
    await expect(fresh.getFresh('any')).resolves.toMatchObject({ amount: 100 });
    await expect(stale.getFresh('any')).resolves.toBeUndefined();
  });
  it('rejects stored entries without a real provider or positive finite amount', async () => {
    const invalid = [
      { provider: '', amount: 100, fetchedAt: 1 }, { provider: 'x', amount: 0, fetchedAt: 1 },
      { provider: 'x', amount: -1, fetchedAt: 1 }, { provider: 'x', amount: Number.NaN, fetchedAt: 1 }
    ];
    for (const quote of invalid) {
      const cache = new QuoteCache(async () => quote, async () => undefined, () => 2);
      await expect(cache.getFresh('any')).resolves.toBeUndefined();
    }
  });
});
