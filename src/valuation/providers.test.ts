import { describe, expect, it, vi } from 'vitest';
import { parseDevice } from '../domain/device';
import { selectOffer } from './normalization';
import { bestQuote, CashExpressProvider, checkProviderContracts, EasyCashProvider, quotesWithDiagnostics } from './providers';
import type { ValuationProvider } from './types';

const phone = parseDevice('iPhone 13')!;

describe('valuation providers', () => {
  it('uses the smallest available storage when Vinted does not state one', () => {
    const quote = selectOffer(phone, [
      { model: 'iPhone 13', storage: 256, condition: 'good condition', amount: 300 },
      { model: 'iPhone 13', storage: 128, condition: 'good condition', amount: 250 }
    ], 'test', 1);
    expect(quote?.amount).toBe(250);
  });
  it('does not substitute a prefixed model, condition, or storage variant', () => {
    const knownVariant = parseDevice('iPhone 13 128 GB')!;
    expect(selectOffer(knownVariant, [
      { model: 'iPhone 13 Pro', storage: 128, condition: 'good condition', amount: 400 },
      { model: 'iPhone 13', storage: 256, condition: 'good condition', amount: 300 },
      { model: 'iPhone 13', storage: 128, condition: 'excellent condition', amount: 300 }
    ], 'test')).toBeUndefined();
  });
  it('uses the highest usable source quote when another source fails', async () => {
    const sources: ValuationProvider[] = [
      { name: 'failed', getQuote: async () => { throw new Error('down'); } },
      { name: 'usable', getQuote: async () => ({ provider: 'usable', amount: 220, fetchedAt: 1 }) },
      { name: 'better', getQuote: async () => ({ provider: 'better', amount: 240, fetchedAt: 1 }) }
    ];
    await expect(bestQuote(phone, sources)).resolves.toMatchObject({ provider: 'better', amount: 240 });
  });
  it('follows Easy Cash colour, capacity and condition pages before reading its buy-back price', async () => {
    const pages = [
      '<a href="/vendez/Smartphones/APPLE/iPhone%2016/Noir">Wrong model</a><a href="/vendez/Smartphones/APPLE/iPhone%2013/Minuit">Black</a>',
      '<a href="/vendez/Smartphones/APPLE/iPhone%2013/Minuit/128%20Go">128 Go</a><a href="/vendez/Smartphones/APPLE/iPhone%2013/Minuit/256%20Go">256 Go</a>',
      '<a href="/vendez/fiche-produit/Smartphones/APPLE/iPhone%2013/Minuit/128%20Go?id=1&amp;grade=B">Bon état</a>',
      '<span class="sell-price--price">167,00 <svg></svg></span>'
    ];
    const request = async () => new Response(pages.shift()!, { status: 200 });
    await expect(new EasyCashProvider(request as typeof fetch).getQuote(phone)).resolves.toMatchObject({ amount: 167 });
  });
  it('rejects failed provider responses', async () => {
    const request = async () => new Response('', { status: 503 });
    await expect(new EasyCashProvider(request as typeof fetch).getQuote(phone)).rejects.toThrow('503');
  });
  it('serializes simultaneous Easy Cash journeys', async () => {
    let active = 0;
    let peak = 0;
    const request = async (input: RequestInfo | URL) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      const url = String(input);
      const page = url.includes('fiche-produit') ? '<span class="sell-price--price">167,00</span>'
        : url.includes('128%20Go') ? '<a href="/vendez/fiche-produit/Smartphones/APPLE/iPhone%2013/Minuit/128%20Go?id=1&amp;grade=B">B</a>'
          : url.includes('Minuit') ? '<a href="/vendez/Smartphones/APPLE/iPhone%2013/Minuit/128%20Go">128</a>'
            : '<a href="/vendez/Smartphones/APPLE/iPhone%2013/Minuit">Black</a>';
      return new Response(page, { status: 200 });
    };
    const provider = new EasyCashProvider(request as typeof fetch);
    await Promise.all([provider.getQuote(phone), provider.getQuote(phone)]);
    expect(peak).toBe(1);
  });
  it('times out one provider while retaining a quote from another', async () => {
    vi.useFakeTimers();
    try {
      const stalled = new EasyCashProvider((async () => new Promise<Response>(() => undefined)) as typeof fetch);
      const result = bestQuote(phone, [stalled, { name: 'usable', getQuote: async () => ({ provider: 'usable', amount: 220, fetchedAt: 1 }) }]);
      await vi.advanceTimersByTimeAsync(8_000);
      await expect(result).resolves.toMatchObject({ provider: 'usable', amount: 220 });
    } finally { vi.useRealTimers(); }
  });
  it('aborts the underlying provider fetch when its request times out', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const provider = new EasyCashProvider((async (_input, init) => {
        signal = init?.signal as AbortSignal;
        return new Promise<Response>(() => undefined);
      }) as typeof fetch);
      const result = provider.getQuote(phone).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(8_000);
      await expect(result).resolves.toMatchObject({ message: 'valuation request timed out' });
      expect(signal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('reads Cash Express only from its created line price and removes the temporary basket', async () => {
    const replies = [
      { status: 'success', brands: [{ value: 'APPLE', label: 'Apple' }] },
      { status: 'success', models: [{ value: 'IPHONE 13 5G', label: 'iPhone 13 5G' }] },
      { status: 'success', attributes: [{ value: '128Go', label: '128 Go' }] },
      { status: 'success' },
      { status: 'redirect', redirect: 'https://www.cashexpress.fr/revendre/panier' },
      '<main><span data-total-estimated>999 €</span><div data-cart-item="basket-1"><!-- <div> --><script>const markup = "<div>";</script><div><span data-total-estimated>305,70 €</span><span class="purchase-cart-item__price">Offer: <strong>210 €</strong></span></div></div></main>',
      { status: 'success' }
    ];
    const actions: string[] = [];
    const request = async (input: RequestInfo | URL, init?: RequestInit) => {
      const action = new URL(String(input)).searchParams.get('action') ?? 'basket-page';
      actions.push(action);
      if (action === 'add-to-cart') {
        const fields = init!.body as FormData;
        expect(fields.get('step1_fields[functional]')).toBe('1');
        expect(fields.get('step2_fields[model]')).toBe('IPHONE 13 5G');
        expect(fields.get('step3_fields[screen_state]')).toBe('scratches');
      }
      const reply = replies.shift();
      return new Response(action === 'basket-page' ? String(reply) : JSON.stringify(reply), { status: 200 });
    };
    await expect(new CashExpressProvider(request as typeof fetch).getQuote(phone)).resolves.toMatchObject({ provider: 'Cash Express', amount: 210 });
    expect(actions).toEqual(['getBrands', 'getModels', 'getAttributes', 'calculateGrade', 'add-to-cart', 'basket-page', 'remove-product']);
  });
  it('uses the smallest Cash Express capacity when storage is absent', async () => {
    const replies = [
      { status: 'success', brands: [{ value: 'APPLE', label: 'Apple' }] },
      { status: 'success', models: [{ value: 'IPHONE 13 5G', label: 'iPhone 13 5G' }] },
      { status: 'success', attributes: [{ value: '256Go', label: '256 Go' }, { value: '128Go', label: '128 Go' }] },
      { status: 'eligible' }, { status: 'redirect', redirect: 'https://www.cashexpress.fr/revendre/panier' },
      '<main><div data-cart-item="basket-1"><div><span class="purchase-cart-item__price">160</span></div></div></main>', {}
    ];
    const request = async (input: RequestInfo | URL, init?: RequestInit) => {
      const action = new URL(String(input)).searchParams.get('action') ?? 'basket-page';
      if (action === 'add-to-cart') expect((init!.body as FormData).get('step2_fields[capacity]')).toBe('128Go');
      const reply = replies.shift();
      return new Response(action === 'basket-page' ? String(reply) : JSON.stringify(reply), { status: 200 });
    };
    await expect(new CashExpressProvider(request as typeof fetch).getQuote(parseDevice('iPhone 13')!)).resolves.toMatchObject({ amount: 160 });
  });
  it('matches a Galaxy option even when only the provider label omits Samsung', async () => {
    const galaxy = parseDevice('Samsung Galaxy S22 128 Go')!;
    const replies = [
      { status: 'success', brands: [{ value: 'SAMSUNG', label: 'Samsung' }] }, { status: 'success', models: [{ value: 'S22', label: 'Galaxy S22' }] },
      { status: 'success', attributes: [{ value: '128Go', label: '128 Go' }] }, { status: 'success' },
      { status: 'redirect', redirect: 'https://www.cashexpress.fr/revendre/panier', basket_id: 'basket-1' },
      '<div data-cart-item="basket-1"><div><span class="purchase-cart-item__price">200</span></div></div>', { status: 'success' }
    ];
    const request = async (input: RequestInfo | URL) => {
      const action = new URL(String(input)).searchParams.get('action') ?? 'basket-page';
      const reply = replies.shift();
      return new Response(action === 'basket-page' ? String(reply) : JSON.stringify(reply), { status: 200 });
    };
    await expect(new CashExpressProvider(request as typeof fetch).getQuote(galaxy)).resolves.toMatchObject({ amount: 200 });
  });
  it('normalizes TB and To Cash Express capacities', async () => {
    const replies = [
      { status: 'success', brands: [{ value: 'APPLE', label: 'Apple' }] },
      { status: 'success', models: [{ value: 'IPHONE 13 5G', label: 'iPhone 13 5G' }] },
      { status: 'success', attributes: [{ value: '1To', label: '1 To' }] }, { status: 'eligible' },
      { status: 'redirect', redirect: 'https://www.cashexpress.fr/revendre/panier', basket_id: 'basket-1' },
      '<main><div data-cart-item="basket-1"><div><span class="purchase-cart-item__price">160</span></div></div></main>', { status: 'success' }
    ];
    const request = async (input: RequestInfo | URL, init?: RequestInit) => {
      const action = new URL(String(input)).searchParams.get('action') ?? 'basket-page';
      if (action === 'add-to-cart') expect((init!.body as FormData).get('step2_fields[capacity]')).toBe('1To');
      const reply = replies.shift();
      return new Response(action === 'basket-page' ? String(reply) : JSON.stringify(reply), { status: 200 });
    };
    await expect(new CashExpressProvider(request as typeof fetch).getQuote(parseDevice('iPhone 13 1 TB')!)).resolves.toMatchObject({ amount: 160 });
  });
  it('attempts Cash Express cleanup when its redirected basket page fails', async () => {
    const actions: string[] = [];
    const replies = [
      { status: 'success', brands: [{ value: 'APPLE', label: 'Apple' }] }, { status: 'success', models: [{ value: 'IPHONE 13', label: 'iPhone 13' }] },
      { status: 'success', attributes: [{ value: '128Go', label: '128 Go' }] }, { status: 'success' },
      { status: 'redirect', redirect: 'https://www.cashexpress.fr/revendre/panier', basket_id: 'basket-1' }, { status: 'success' }
    ];
    const request = async (input: RequestInfo | URL) => {
      const action = new URL(String(input)).searchParams.get('action') ?? 'basket-page';
      actions.push(action);
      if (action === 'basket-page') return new Response('', { status: 503 });
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    };
    await expect(new CashExpressProvider(request as typeof fetch).getQuote(phone)).rejects.toThrow('basket page returned 503');
    expect(actions).toContain('remove-product');
  });
  it('rejects ambiguous or unrelated Cash Express displayed totals while cleaning up', async () => {
    const replies = [
      { status: 'success', brands: [{ value: 'APPLE', label: 'Apple' }] }, { status: 'success', models: [{ value: 'IPHONE 13', label: 'iPhone 13' }] },
      { status: 'success', attributes: [{ value: '128Go', label: '128 Go' }] }, { status: 'success' },
      { status: 'redirect', redirect: 'https://www.cashexpress.fr/revendre/panier', basket_id: 'basket-1' },
      '<div data-cart-item="basket-1"><span class="purchase-cart-item__price">160</span><span class="purchase-cart-item__price">210</span></div>', { status: 'success' }
    ];
    const actions: string[] = [];
    const request = async (input: RequestInfo | URL) => {
      const action = new URL(String(input)).searchParams.get('action') ?? 'basket-page';
      actions.push(action);
      const reply = replies.shift();
      return new Response(action === 'basket-page' ? String(reply) : JSON.stringify(reply), { status: 200 });
    };
    await expect(new CashExpressProvider(request as typeof fetch).getQuote(phone)).resolves.toBeUndefined();
    expect(actions).toContain('remove-product');
  });
  it('does not read or remove another Cash Express basket when the new basket ID is unknown', async () => {
    const replies = [
      { status: 'success', brands: [{ value: 'APPLE', label: 'Apple' }] }, { status: 'success', models: [{ value: 'IPHONE 13', label: 'iPhone 13' }] },
      { status: 'success', attributes: [{ value: '128Go', label: '128 Go' }] }, { status: 'success' },
      { status: 'redirect', redirect: 'https://www.cashexpress.fr/revendre/panier' },
      '<div data-cart-item="older"><span class="purchase-cart-item__price">999</span></div><div data-cart-item="new"><span class="purchase-cart-item__price">160</span></div>'
    ];
    const actions: string[] = [];
    const request = async (input: RequestInfo | URL) => {
      const action = new URL(String(input)).searchParams.get('action') ?? 'basket-page';
      actions.push(action);
      const reply = replies.shift();
      return new Response(action === 'basket-page' ? String(reply) : JSON.stringify(reply), { status: 200 });
    };
    await expect(new CashExpressProvider(request as typeof fetch).getQuote(phone)).resolves.toBeUndefined();
    expect(actions).not.toContain('remove-product');
  });
  it('throws a provider-contract error for malformed Cash Express payloads', async () => {
    const request = async () => new Response('not json', { status: 200 });
    await expect(new CashExpressProvider(request as typeof fetch).getQuote(phone)).rejects.toThrow('malformed response');
  });
  it('records a source failure without converting it to a price', async () => {
    const result = await quotesWithDiagnostics(phone, [{ name: 'outage', getQuote: async () => { throw new Error('timeout'); } }, { name: 'usable', getQuote: async () => ({ provider: 'usable', amount: 220, fetchedAt: 1 }) }]);
    expect(result).toEqual({ quote: { provider: 'usable', amount: 220, fetchedAt: 1 }, diagnostics: [{ provider: 'outage', reason: 'timeout' }] });
  });
  it('checks the live-provider metadata contracts without creating a Cash Express basket', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return String(input).includes('cashexpress')
        ? new Response(JSON.stringify({ status: 'success', brands: [{ value: 'APPLE', label: 'Apple' }] }), { status: 200 })
        : new Response('<a href="/vendez/Smartphones/APPLE/iPhone%2013/Minuit">Black</a>', { status: 200 });
    };
    await expect(checkProviderContracts(request as typeof fetch)).resolves.toEqual([]);
    expect(calls.map(({ url }) => url)).toEqual([
      'https://prix.easycash.fr/vendez/Smartphones/APPLE/iPhone%2013',
      'https://www.cashexpress.fr/revendre/smartphone?action=getBrands'
    ]);
    expect((calls[1].init!.body as FormData).get('slug')).toBe('smartphone');
  });
});
