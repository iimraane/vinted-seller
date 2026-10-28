import type { Device } from '../domain/device';
import { QuoteCache } from './cache';
import { CashExpressProvider, EasyCashProvider, quotesWithDiagnostics } from '../valuation/providers';
import type { Quote } from '../valuation/types';

const storage = chrome.storage.local;
const cache = new QuoteCache(
  async (key) => (await storage.get(key))[key] as Quote | undefined,
  async (key, quote) => { await storage.set({ [key]: quote }); }
);
const providers = [new EasyCashProvider(), new CashExpressProvider()];
// Invalidate quotes parsed before Cash Express line-item extraction was fixed.
const cacheKey = (device: Device) => `valuation:v2:${device.brand}:${device.model}:${device.storage ?? 'smallest'}:${device.condition}`;
const inFlight = new Map<string, Promise<Quote | undefined>>();

async function loadQuote(key: string, device: Device): Promise<Quote | undefined> {
  let cached: Quote | undefined;
  try { cached = await cache.getFresh(key); } catch (error) { console.warn('valuation cache read unavailable', error); }
  if (cached) return cached;
  const { quote, diagnostics } = await quotesWithDiagnostics(device, providers);
  diagnostics.forEach(({ provider, reason }) => console.warn(`valuation provider unavailable: ${provider}: ${reason}`));
  if (quote) {
    try { await cache.set(key, quote); } catch (error) { console.warn('valuation cache write unavailable', error); }
  }
  return quote;
}

function quoteFor(key: string, device: Device): Promise<Quote | undefined> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = loadQuote(key, device).finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

chrome.runtime.onMessage.addListener((message: { type?: string; device?: Device }, _sender, sendResponse) => {
  if (message.type !== 'GET_VALUATION' || !message.device) return;
  void (async () => {
    const key = cacheKey(message.device!);
    const quote = await quoteFor(key, message.device!);
    sendResponse({ quote: quote?.amount, provider: quote?.provider, fetchedAt: quote?.fetchedAt });
  })().catch(() => sendResponse({ quote: undefined, provider: undefined, fetchedAt: undefined }));
  return true;
});
