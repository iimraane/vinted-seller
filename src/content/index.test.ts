// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('content script integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('observes a newly inserted Vinted card, requests a quote, and renders the margin', async () => {
    document.body.innerHTML = '';
    const sendMessage = vi.fn((_message, callback: (reply: { quote: number }) => void) => callback({ quote: 120 }));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    await import('./index');

    document.body.insertAdjacentHTML('beforeend', '<div data-testid="item-box"><span>iPhone 13 128 GB</span><span data-testid="item-price">100 €</span></div>');
    await vi.waitFor(() => expect(document.querySelector('.vpm-margin-badge')?.textContent).toBe('+9 €'));
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'GET_VALUATION' }), expect.any(Function));
  });

  it('shows an unknown badge after a missing runtime response and leaves the card retryable', async () => {
    vi.useFakeTimers();
    try {
      const sendMessage = vi.fn();
      vi.stubGlobal('chrome', { runtime: { sendMessage } });
      await import('./index');
      document.body.insertAdjacentHTML('beforeend', '<div data-testid="item-box"><span>iPhone 13 128 GB</span><span data-testid="item-price">100 €</span></div>');
      await vi.advanceTimersByTimeAsync(100);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(document.querySelector('.vpm-margin-badge')?.textContent).toBe('?');
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(100);
      expect(sendMessage).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it('keeps a successful surface only through fetchedAt plus the 24-hour TTL', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(1_000_000_000));
      const sendMessage = vi.fn((_message, callback: (reply: { quote: number; fetchedAt: number }) => void) => {
        callback({ quote: 120, fetchedAt: Date.now() - (24 * 60 * 60 * 1000) + 59_900 });
      });
      vi.stubGlobal('chrome', { runtime: { sendMessage } });
      await import('./index');
      document.body.insertAdjacentHTML('beforeend', '<div data-testid="item-box"><span>iPhone 13 128 GB</span><span data-testid="item-price">100 €</span></div>');
      await vi.advanceTimersByTimeAsync(100);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      // The first recheck lands precisely at fetchedAt + TTL, so the cached
      // surface must be evaluated again rather than retained for a calendar day.
      await vi.advanceTimersByTimeAsync(59_900);
      await vi.advanceTimersByTimeAsync(100);
      expect(sendMessage).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it('shows one Scam pill for the contiguous bank-transfer warning without requesting a quote', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    history.pushState({}, '', '/items/123-phone');
    document.body.innerHTML = `<main><div data-testid="item-gallery"></div><h1>iPhone 13</h1>
      <div data-testid="item-price">100 €</div><div data-testid="item-description">Paiement par virement bancaire uniquement</div></main>`;
    await import('./index');
    await vi.waitFor(() => expect(document.querySelector('.vpm-margin-badge')?.textContent).toBe('Scam'));
    expect(document.querySelectorAll('.vpm-margin-badge')).toHaveLength(1);
    expect(sendMessage).not.toHaveBeenCalled();
    history.pushState({}, '', '/');
  });
  it('does not mark non-contiguous bank-transfer words as Scam', async () => {
    const sendMessage = vi.fn((_message, callback: (reply: { quote: number }) => void) => callback({ quote: 120 }));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    history.pushState({}, '', '/items/125-phone');
    document.body.innerHTML = `<main><div data-testid="item-gallery"></div><h1>iPhone 13</h1>
      <div data-testid="item-price">100 €</div><div data-testid="item-description">Virement possible, bancaire ou carte.</div></main>`;
    await import('./index');
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(document.querySelector('.vpm-margin-badge')?.textContent).not.toBe('Scam');
    history.pushState({}, '', '/');
  });
  it('does not request a valuation for an empty-package product description', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    history.pushState({}, '', '/items/124-phone');
    document.body.innerHTML = `<main><h1>iPhone 13</h1><div data-testid="item-price">100 €</div>
      <div data-testid="item-description">Boîte vide, téléphone non inclus</div></main>`;
    await import('./index');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector('.vpm-margin-badge')).toBeNull();
    history.pushState({}, '', '/');
  });
  it('replaces a hydrated bank-transfer description with a Scam pill', async () => {
    const sendMessage = vi.fn((_message, callback: (reply: { quote: number }) => void) => callback({ quote: 120 }));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    history.pushState({}, '', '/items/126-phone');
    document.body.innerHTML = '<main><div data-testid="item-gallery"></div><h1>iPhone 13</h1><div data-testid="item-price">100 €</div><div data-testid="item-description"></div></main>';
    await import('./index');
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    document.querySelector('[data-testid="item-description"]')!.textContent = 'virement bancaire';
    await vi.waitFor(() => expect(document.querySelector('.vpm-margin-badge')?.textContent).toBe('Scam'));
    history.pushState({}, '', '/');
  });
});
