import { afterEach, describe, expect, it, vi } from 'vitest';

type Listener = (message: { type?: string; device?: unknown }, sender: unknown, respond: (reply: { quote?: number; provider?: string; fetchedAt?: number }) => void) => boolean | undefined;

describe('background valuation handler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns a fresh cached quote without fetching providers', async () => {
    let listener: Listener | undefined;
    const get = vi.fn(async () => ({ 'valuation:v2:iphone:iPhone 13:128:good condition': { amount: 201, provider: 'cache', fetchedAt: Date.now() } }));
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('chrome', { storage: { local: { get, set: vi.fn() } }, runtime: { onMessage: { addListener: (handler: Listener) => { listener = handler; } } } });
    await import('./index');
    const response = await new Promise<{ quote?: number; provider?: string; fetchedAt?: number }>((resolve) => listener!({ type: 'GET_VALUATION', device: { brand: 'iphone', model: 'iPhone 13', storage: 128, condition: 'good condition' } }, {}, resolve));
    expect(response).toMatchObject({ quote: 201, provider: 'cache' });
    expect(response.fetchedAt).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('coalesces simultaneous cache misses for the same device', async () => {
    let listener: Listener | undefined;
    const get = vi.fn(async () => ({}));
    const set = vi.fn(async () => undefined);
    const pages = [
      '<a href="/vendez/Smartphones/APPLE/iPhone%2013/Minuit">Black</a>',
      '<a href="/vendez/Smartphones/APPLE/iPhone%2013/Minuit/128%20Go">128</a>',
      '<a href="/vendez/fiche-produit/Smartphones/APPLE/iPhone%2013/Minuit/128%20Go?id=1&amp;grade=B">B</a>',
      '<span class="sell-price--price">210,00</span>'
    ];
    const fetch = vi.fn(async (input: RequestInfo | URL) => String(input).includes('cashexpress')
      ? new Response('', { status: 503 })
      : new Response(pages.shift()!, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('chrome', { storage: { local: { get, set } }, runtime: { onMessage: { addListener: (handler: Listener) => { listener = handler; } } } });
    await import('./index');
    const message = { type: 'GET_VALUATION', device: { brand: 'iphone', model: 'iPhone 13', storage: 128, condition: 'good condition' } };
    const replies = await Promise.all([1, 2].map(() => new Promise<{ quote?: number; provider?: string; fetchedAt?: number }>((resolve) => listener!(message, {}, resolve))));
    expect(replies).toEqual(expect.arrayContaining([expect.objectContaining({ quote: 210, provider: 'Easy Cash' }), expect.objectContaining({ quote: 210, provider: 'Easy Cash' })]));
    expect(fetch).toHaveBeenCalledTimes(5); // one Easy Cash journey plus one isolated Cash Express failure
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('continues after cache read and write failures', async () => {
    let listener: Listener | undefined;
    const pages = ['<a href="/vendez/Smartphones/APPLE/iPhone%2013/Minuit">Black</a>', '<a href="/vendez/Smartphones/APPLE/iPhone%2013/Minuit/128%20Go">128</a>', '<a href="/vendez/fiche-produit/Smartphones/APPLE/iPhone%2013/Minuit/128%20Go?id=1&amp;grade=B">B</a>', '<span class="sell-price--price">210,00</span>'];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => String(input).includes('cashexpress') ? new Response('', { status: 503 }) : new Response(pages.shift()!, { status: 200 }));
    vi.stubGlobal('chrome', { storage: { local: { get: async () => { throw new Error('storage offline'); }, set: async () => { throw new Error('storage offline'); } } }, runtime: { onMessage: { addListener: (handler: Listener) => { listener = handler; } } } });
    await import('./index');
    const response = await new Promise<{ quote?: number; provider?: string; fetchedAt?: number }>((resolve) => listener!({ type: 'GET_VALUATION', device: { brand: 'iphone', model: 'iPhone 13', storage: 128, condition: 'good condition' } }, {}, resolve));
    expect(response).toMatchObject({ quote: 210, provider: 'Easy Cash' });
  });
});
