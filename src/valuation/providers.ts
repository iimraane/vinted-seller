import type { Device } from '../domain/device';
import type { ProviderDiagnostic, Quote, QuoteResult, ValuationProvider } from './types';

type FetchLike = typeof fetch;
const REQUEST_TIMEOUT_MS = 8_000;
const EASY_CASH_ORIGIN = 'https://prix.easycash.fr';
const CASH_EXPRESS_URL = 'https://www.cashexpress.fr/revendre/smartphone';

function withinTimeout<T>(request: (signal: AbortSignal) => Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('valuation request timed out')); }, timeoutMs); });
  return Promise.race([request(controller.signal), timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"');
}

function hrefs(html: string, filter: (href: string) => boolean): string[] {
  return Array.from(html.matchAll(/href=["']([^"']+)["']/gi), (match) => decodeHtml(match[1]))
    .filter(filter)
    .map((href) => new URL(href, EASY_CASH_ORIGIN).href);
}

function capacityOf(url: string): number | undefined {
  const decoded = decodeURIComponent(url);
  const match = decoded.match(/\/(\d+)\s*(?:Go|GB|TB|To)(?:[/?]|$)/i);
  if (!match) return undefined;
  return /(?:TB|To)/i.test(decoded) ? Number(match[1]) * 1024 : Number(match[1]);
}

function smallestCapacity(urls: string[]): string | undefined {
  return urls.map((url) => ({ url, capacity: capacityOf(url) }))
    .filter((entry): entry is { url: string; capacity: number } => entry.capacity !== undefined)
    .sort((a, b) => a.capacity - b.capacity)[0]?.url;
}

function priceFromEasyCash(html: string): number | undefined {
  const match = html.match(/sell-price--price[^>]*>\s*([0-9][0-9\s]*(?:[,.]\d{1,2})?)/i);
  if (!match) return undefined;
  const value = Number(match[1].replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

/** Uses Easy Cash's public, step-by-step estimation journey. */
export class EasyCashProvider implements ValuationProvider {
  readonly name = 'Easy Cash';
  /**
   * The public estimator starts returning empty pages when several complete
   * journeys are requested at once.  A catalogue can reveal many cards in a
   * single frame, so keep one journey in flight instead of treating those
   * temporary empty pages as missing valuations.
   */
  private queue: Promise<void> = Promise.resolve();
  // Keep the native fetch bound to the service-worker global. Passing the bare
  // method and invoking it through this class can fail in Chrome workers.
  constructor(private readonly request: FetchLike = (input, init) => fetch(input, init)) {}

  private async page(url: string): Promise<string> {
    const response = await withinTimeout((signal) => this.request(url, { headers: { Accept: 'text/html' }, signal }));
    if (!response.ok) throw new Error(`${this.name} returned ${response.status}`);
    return response.text();
  }

  async getQuote(device: Device): Promise<Quote | undefined> {
    let release: (() => void) | undefined;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await this.lookup(device);
    } finally {
      release?.();
    }
  }

  private async lookup(device: Device): Promise<Quote | undefined> {
    const brand = device.brand === 'iphone' ? 'APPLE' : 'SAMSUNG';
    const modelUrl = `${EASY_CASH_ORIGIN}/vendez/Smartphones/${brand}/${encodeURIComponent(device.model)}`;
    const modelPath = new URL(modelUrl).pathname;
    // The model page also contains navigation links for every other phone.
    // Only accept a direct child route of the requested model (the colour step).
    const colorUrl = hrefs(await this.page(modelUrl), (href) => {
      const pathname = new URL(href, EASY_CASH_ORIGIN).pathname;
      return pathname.startsWith(`${modelPath}/`) && pathname.slice(modelPath.length + 1).split('/').length === 1;
    })[0];
    if (!colorUrl) return undefined;
    const capacityUrls = hrefs(await this.page(colorUrl), (href) => /\/(?:\d+)\s*(?:Go|GB|TB|To)(?:[/?]|$)/i.test(decodeURIComponent(href)));
    const capacityUrl = device.storage === undefined
      ? smallestCapacity(capacityUrls)
      : capacityUrls.find((url) => capacityOf(url) === device.storage);
    if (!capacityUrl) return undefined;
    const grade = device.condition === 'excellent condition' ? 'A' : device.condition === 'fair condition' ? 'C' : 'B';
    const gradeUrl = hrefs(await this.page(capacityUrl), (href) => href.includes('/vendez/fiche-produit/') && new URL(href, EASY_CASH_ORIGIN).searchParams.get('grade') === grade)[0];
    if (!gradeUrl) return undefined;
    const amount = priceFromEasyCash(await this.page(gradeUrl));
    return amount === undefined ? undefined : { provider: this.name, amount, fetchedAt: Date.now() };
  }
}

/** Cash Express is reserved for its live estimator; never infer a quote from sale prices. */
export class CashExpressProvider implements ValuationProvider {
  readonly name = 'Cash Express';
  /** The public estimator stores its temporary basket in the browser session. */
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly request: FetchLike = (input, init) => fetch(input, init)) {}

  private async post(action: string, fields: Record<string, string> = {}): Promise<unknown> {
    const body = new FormData();
    body.set('slug', 'smartphone');
    Object.entries(fields).forEach(([key, value]) => body.set(key, value));
    // Cash Express routes estimator actions through the query string, with the
    // selection itself in multipart FormData. The same session owns the
    // temporary basket and its cleanup, hence credentials must be retained.
    const response = await withinTimeout((signal) => this.request(`${CASH_EXPRESS_URL}?action=${encodeURIComponent(action)}`, {
      method: 'POST', body, credentials: 'include', redirect: 'follow',
      headers: { Accept: 'application/json, text/html', 'X-Requested-With': 'XMLHttpRequest' }, signal
    }));
    if (!response.ok) throw new Error(`${this.name} returned ${response.status}`);
    const text = await response.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  private async page(url: string): Promise<string> {
    const response = await withinTimeout((signal) => this.request(url, { credentials: 'include', headers: { Accept: 'text/html' }, signal }));
    if (!response.ok) throw new Error(`${this.name} basket page returned ${response.status}`);
    return response.text();
  }

  private options(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value)) return value.flatMap((item) => this.options(item));
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const nested = Object.values(record).flatMap((item) => Array.isArray(item) || (item && typeof item === 'object') ? this.options(item) : []);
    return ('id' in record || 'value' in record || 'name' in record || 'label' in record) ? [record, ...nested] : nested;
  }

  private option(value: unknown, label: string): Record<string, unknown> | undefined {
    const normalized = label.replace(/\s+/g, ' ').trim().toLowerCase();
    return this.options(value).find((entry) => String(entry.name ?? entry.label ?? entry.text ?? entry.value ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === normalized);
  }

  private id(option: Record<string, unknown>): string | undefined {
    const value = option.id ?? option.value ?? option.slug ?? option.code;
    return value === undefined || value === null ? undefined : String(value);
  }

  private response(value: unknown, action: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as Record<string, unknown>).status !== 'string') {
      throw new Error(`${this.name} ${action} returned a malformed response`);
    }
    const record = value as Record<string, unknown>;
    if (!/^(success|eligible|redirect)$/i.test(record.status as string)) {
      throw new Error(`${this.name} ${action} returned unknown status ${String(record.status)}`);
    }
    return record;
  }

  private selectionResponse(value: unknown, action: string): Record<string, unknown> {
    const response = this.response(value, action);
    if (!Object.values(response).some(Array.isArray)) {
      throw new Error(`${this.name} ${action} returned a malformed response`);
    }
    return response;
  }

  private capacity(option: Record<string, unknown>): number | undefined {
    const label = String(option.name ?? option.label ?? option.text ?? option.value ?? '');
    const match = label.match(/(\d+)\s*(Go|GB|TB|To)\b/i);
    if (!match) return undefined;
    return /^(TB|To)$/i.test(match[2]) ? Number(match[1]) * 1024 : Number(match[1]);
  }

  private modelOption(value: unknown, model: string): Record<string, unknown> | undefined {
    const normalized = (label: string) => label.toLowerCase().replace(/^\s*samsung\s+/i, '').replace(/\b5g\b/g, '').replace(/[^a-z0-9]/g, '');
    const target = normalized(model);
    return this.options(value).find((entry) => normalized(String(entry.name ?? entry.label ?? entry.text ?? entry.value ?? '')) === target);
  }

  private basketIds(value: unknown): string[] {
    const source = typeof value === 'string' ? value : JSON.stringify(value);
    const ids = new Set<string>();
    for (const match of source.matchAll(/(?:basket|product|cart_item)[_-]?id["']?\s*[:=]\s*["']?([\w-]+)/gi)) ids.add(match[1]);
    for (const match of source.matchAll(/data-cart-item=["']([\w-]+)["']/gi)) ids.add(match[1]);
    return [...ids];
  }

  private elementHtml(html: string, opening: RegExpExecArray): string | undefined {
    if (!opening[1] || opening.index === undefined) return undefined;
    const tag = opening[1];
    const tags = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'ig');
    tags.lastIndex = opening.index;
    let depth = 0;
    for (let match = tags.exec(html); match; match = tags.exec(html)) {
      const source = match[0];
      if (source.startsWith('</')) depth -= 1;
      else if (!source.endsWith('/>')) depth += 1;
      if (depth === 0) return html.slice(opening.index, tags.lastIndex);
    }
    return undefined;
  }

  private basketItem(html: string, basketId: string): string | undefined {
    // Price markup can contain comments or scripts whose literal angle brackets
    // must not be mistaken for nested item containers.
    const source = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
    const escapedId = basketId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const opening = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*\\bdata-cart-item=["']${escapedId}["'][^>]*>`, 'ig').exec(source);
    return opening ? this.elementHtml(source, opening) : undefined;
  }

  private price(basketHtml: string, basketId: string): number | undefined {
    // Cash Express may retain old temporary estimates in the same session.
    // Its page-level data-total-estimated is an aggregate, so take only the
    // visible buy-back price from the line that add-to-cart just created.
    const item = this.basketItem(basketHtml, basketId);
    if (!item) return undefined;
    const values = Array.from(item.matchAll(/<([a-z][\w:-]*)\b[^>]*\bclass=["'][^"']*\bpurchase-cart-item__price\b[^"']*["'][^>]*>/gi), (match) => this.elementHtml(item, match))
      .filter((value): value is string => value !== undefined)
      .map((value) => value.replace(/<[^>]+>|&nbsp;/gi, ' '))
      .flatMap((value) => Array.from(value.matchAll(/([0-9][0-9\s.,]*)/g), (match) => match[1]))
      .map((value) => Number(value.replace(/\s/g, '').replace(',', '.')))
      .filter((value) => Number.isFinite(value) && value > 0);
    return values.length === 1 ? values[0] : undefined;
  }

  async getQuote(device: Device): Promise<Quote | undefined> {
    let release: (() => void) | undefined;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await this.lookup(device);
    } finally {
      release?.();
    }
  }

  private async lookup(device: Device): Promise<Quote | undefined> {
    const brandName = device.brand === 'iphone' ? 'APPLE' : 'SAMSUNG';
    const brands = this.selectionResponse(await this.post('getBrands'), 'getBrands');
    const brand = this.option(brands, brandName);
    const brandId = brand && this.id(brand);
    if (!brandId) return undefined;
    const models = this.selectionResponse(await this.post('getModels', { brand: brandId }), 'getModels');
    const model = this.modelOption(models, device.model);
    const modelId = model && this.id(model);
    if (!modelId) return undefined;
    const attributes = this.selectionResponse(await this.post('getAttributes', { brand: brandId, model: modelId, search: 'Memoire interne' }), 'getAttributes');
    const capacities = this.options(attributes).map((option) => ({ option, capacity: this.capacity(option) }))
      .filter((entry): entry is { option: Record<string, unknown>; capacity: number } => entry.capacity !== undefined);
    const capacity = device.storage === undefined
      ? capacities.sort((a, b) => a.capacity - b.capacity)[0]?.option
      : capacities.find((entry) => entry.capacity === device.storage)?.option;
    const capacityId = capacity && this.id(capacity);
    if (!capacityId) return undefined;
    const damage = device.condition === 'excellent condition' ? 'intact' : device.condition === 'fair condition' ? 'shock' : 'scratches';
    const estimatorFields = {
      formAction: 'purchase', category_slug: 'smartphone',
      'step1_fields[functional]': '1', 'step1_fields[operator_commitment]': '1',
      'step2_fields[brand]': brandId, 'step2_fields[model]': modelId, 'step2_fields[capacity]': capacityId,
      'attributes[0][label]': 'Memoire interne', 'attributes[0][value]': capacityId,
      'step3_fields[screen_state]': damage, 'step3_fields[back_case_state]': damage, 'step3_fields[buy_condition]': 'used'
    };
    this.response(await this.post('calculateGrade', estimatorFields), 'calculateGrade');
    const createdBasketIds = new Set<string>();
    let cleanupBasketIds: string[] = [];
    try {
      const added = this.response(await this.post('add-to-cart', estimatorFields), 'add-to-cart');
      // Capture this before following a redirect: a failed basket-page fetch
      // must still leave us enough information to attempt cleanup.
      this.basketIds(added).forEach((id) => createdBasketIds.add(id));
      cleanupBasketIds = [...createdBasketIds];
      // The browser journey returns JSON with a `redirect` property, rather
      // than an HTTP redirect, when it is called as an XMLHttpRequest.
      const redirect = added && typeof added === 'object' && typeof (added as Record<string, unknown>).redirect === 'string'
        ? (added as Record<string, string>).redirect
        : undefined;
      const basket = redirect ? await this.page(redirect) : added;
      const serialized = typeof basket === 'string' ? basket : JSON.stringify(basket);
      const pageBasketIds = this.basketIds(serialized);
      // Do not read or remove an older estimate a user already had in the same
      // session. Without an ID from add-to-cart, the page is usable only when
      // it exposes exactly one basket item, which must be the one just added.
      const quoteBasketIds = createdBasketIds.size > 0
        ? [...createdBasketIds]
        : pageBasketIds.length === 1 ? pageBasketIds : [];
      cleanupBasketIds = quoteBasketIds;
      const amount = typeof basket === 'string'
        ? quoteBasketIds.map((id) => this.price(basket, id)).find((value) => value !== undefined)
        : undefined;
      return amount === undefined ? undefined : { provider: this.name, amount, fetchedAt: Date.now() };
    } finally {
      // Cleanup is best effort only: a network outage can prevent removal.
      await Promise.all(cleanupBasketIds.map((id) => this.post('remove-product', { id }).catch(() => undefined)));
    }
  }
}

export async function bestQuote(device: Device, providers: ValuationProvider[]): Promise<Quote | undefined> {
  return (await quotesWithDiagnostics(device, providers)).quote;
}

export async function quotesWithDiagnostics(device: Device, providers: ValuationProvider[]): Promise<QuoteResult> {
  const settled = await Promise.allSettled(providers.map((provider) => provider.getQuote(device)));
  const quotes = settled.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
  const diagnostics: ProviderDiagnostic[] = settled.flatMap((result, index) => result.status === 'rejected'
    ? [{ provider: providers[index].name, reason: result.reason instanceof Error ? result.reason.message : String(result.reason) }]
    : []);
  return { quote: quotes.sort((a, b) => b.amount - a.amount)[0], diagnostics };
}

/** Opt-in contract probe. It reads only public estimator metadata and creates no basket. */
export async function checkProviderContracts(request: FetchLike = fetch): Promise<ProviderDiagnostic[]> {
  const diagnostics: ProviderDiagnostic[] = [];
  try {
    const response = await withinTimeout((signal) => request(`${EASY_CASH_ORIGIN}/vendez/Smartphones/APPLE/iPhone%2013`, { headers: { Accept: 'text/html' }, signal }));
    if (!response.ok) throw new Error(`returned ${response.status}`);
    if (!/\/vendez\/Smartphones\/APPLE\/iPhone%?2013/i.test(await response.text())) throw new Error('model route contract missing');
  } catch (error) { diagnostics.push({ provider: 'Easy Cash', reason: error instanceof Error ? error.message : String(error) }); }
  try {
    const body = new FormData();
    body.set('slug', 'smartphone');
    const response = await withinTimeout((signal) => request(`${CASH_EXPRESS_URL}?action=getBrands`, {
      method: 'POST', body, credentials: 'include',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, signal
    }));
    if (!response.ok) throw new Error(`returned ${response.status}`);
    const payload = JSON.parse(await response.text()) as unknown;
    if (!JSON.stringify(payload).match(/APPLE/i)) throw new Error('brand response contract missing APPLE');
  } catch (error) { diagnostics.push({ provider: 'Cash Express', reason: error instanceof Error ? error.message : String(error) }); }
  return diagnostics;
}
