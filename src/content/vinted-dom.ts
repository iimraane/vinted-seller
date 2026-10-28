import { calculateMargin, calculateMarginFromTotal, formatMargin, marginState, type MarginState } from '../domain/margin';

export const BADGE_CLASS = 'vpm-margin-badge';

export interface ListingSurface {
  host: HTMLElement;
  /** The image layer is the only stable visual anchor on Vinted search cards. */
  badgeHost?: HTMLElement;
  text: string;
  /** Description is safety-only: it must never override product attributes. */
  description?: string;
  itemPrice?: number;
  buyerProtection?: number;
  /** Vinted's displayed price including buyer protection, if it is available. */
  vintedTotal?: number;
}

export function euroNumber(text: string): number | undefined {
  const match = text.replace(/\s/g, '').match(/(\d+(?:[,.]\d{1,2})?)€/);
  return match ? Number(match[1].replace(',', '.')) : undefined;
}

function priceFrom(root: ParentNode): number | undefined {
  const price = root.querySelector<HTMLElement>('[data-testid="item-price"], [data-testid="price"], [data-testid*="item-price"]');
  return price ? euroNumber(price.textContent ?? '') : undefined;
}

function totalFrom(root: ParentNode): number | undefined {
  const total = Array.from(root.querySelectorAll<HTMLElement>('[data-testid*="total"], [data-testid*="price-including"]'))
    .find((node) => /(?:frais\s+vinted\s+inclus|total|inclu)/i.test(node.textContent ?? ''));
  return total ? euroNumber(total.textContent ?? '') : undefined;
}

function pricesFromText(text: string): { itemPrice?: number; vintedTotal?: number } {
  const prices = Array.from(text.matchAll(/(\d+(?:[,.]\d{1,2})?)\s*€/g), (match) => Number(match[1].replace(',', '.')));
  if (prices.length < 1) return {};
  return { itemPrice: prices[0], vintedTotal: prices.length > 1 ? prices[1] : undefined };
}

function listingText(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
  return copy.textContent ?? '';
}

function currentListingSurfaces(documentRoot: Document): ListingSurface[] {
  const candidates = Array.from(documentRoot.querySelectorAll<HTMLElement>('[data-testid^="product-item-id-"]'))
    .filter((host) => !host.dataset.testid?.includes('--'));

  // Vinted repeats the same item id on several nested regions of a single
  // card (image, favourite button, details and price). Treating every region
  // as an item creates stacked `?` badges. Keep the outermost card for each
  // item id, preferring the one that owns the overlay link.
  const roots = new Map<string, HTMLElement>();
  for (const candidate of candidates) {
    const itemId = candidate.dataset.testid?.match(/^product-item-id-(\d+)/)?.[1];
    if (!itemId) continue;
    const existing = roots.get(itemId);
    if (!existing || candidate.contains(existing)) {
      roots.set(itemId, candidate);
    }
  }

  return Array.from(roots.values()).map((host) => {
    const overlay = host.querySelector<HTMLAnchorElement>('[data-testid$="--overlay-link"]');
    const image = host.querySelector<HTMLImageElement>('img[alt]');
    const text = overlay?.getAttribute('title') ?? image?.alt ?? listingText(host);
    const textPrices = pricesFromText(text);
    return {
      host,
      badgeHost: host.querySelector<HTMLElement>('[class*="new-item-box__image-container"]') ?? host,
      text,
      itemPrice: priceFrom(host) ?? textPrices.itemPrice,
      vintedTotal: totalFrom(host) ?? textPrices.vintedTotal
    };
  });
}

function productSurface(documentRoot: Document): ListingSurface | undefined {
  if (!/\/items\/\d+/.test(location.pathname)) return undefined;
  // A Vinted item page also contains cards from the seller and similar items.
  // Select its dedicated price rather than the first matching element within
  // <main>; Vinted currently renders two nested <main> elements.
  const price = documentRoot.querySelector<HTMLElement>('[data-testid="item-price"]');
  if (!price) return undefined;
  const productRegion = price.closest<HTMLElement>('[class*="item-details"]')
    ?? price.closest<HTMLElement>('main')
    ?? price.parentElement
    ?? price;
  const title = productRegion.querySelector<HTMLElement>('[data-testid="item-title"], h1')
    ?? documentRoot.querySelector<HTMLElement>('[data-testid="item-page-summary-plugin"] h1, h1');
  const protection = productRegion.querySelector<HTMLElement>('[data-testid="buyer-protection"], [data-testid*="buyer-protection"]');
  const itemPrice = euroNumber(price.textContent ?? '');
  // Scope the total to the pricing block. Item pages also render seller and
  // recommendation cards before the sidebar, each with its own all-in price.
  const pricingRegion = price.closest<HTMLElement>('[class*="details-list--pricing"]') ?? price.parentElement ?? price;
  const liveTotal = totalFrom(pricingRegion);
  const fallbackTotal = pricesFromText(price.parentElement?.parentElement?.textContent ?? '').vintedTotal;
  // A nearby buyer-protection fee is not an all-in item total. Only accept a
  // fallback that is actually greater than the listed price.
  const displayedTotal = [liveTotal, fallbackTotal].find((total) => total !== undefined && (itemPrice === undefined || total > itemPrice));
  const detailsText = productRegion.textContent ?? '';
  // Attribute rows are authoritative. The title is a fallback only when
  // Vinted has not hydrated a model row yet; description prose is safety-only.
  const model = detailsText.match(/(?:mod[èe]le)\s*[:\-]?\s*((?:Samsung\s+)?Galaxy\s+(?:[AS]\d+(?:\s*(?:5G|FE|Ultra|Plus))?|Note\s*\d+(?:\s+Ultra)?|Z\s*(?:Flip|Fold)\s*\d+)|iPhone\s+(?:\d{1,2}(?:\s+(?:Pro(?:\s+Max)?|Plus|mini))?|SE(?:\s*\(?20(?:16|20|22)\)?)?|Air))/i)?.[1] ?? title?.textContent ?? '';
  const storage = detailsText.match(/(?:capacit[ée]\s+de\s+stockage|stockage|m[ée]moire(?:\s+interne)?)\s*[:\-]?\s*(\d+\s*(?:Go|GB|TB))/i)?.[1] ?? '';
  const condition = detailsText.match(/(?:[ée]tat|condition)\s*[:\-]?\s*(très bon état|bon état|satisfaisant|neuf(?:\s+avec\s+[ée]tiquette|\s+sans\s+[ée]tiquette)?)/i)?.[1] ?? '';
  // The description has no stable test id on the current product page. The
  // details panel is bounded to this item and therefore safe for veto-only
  // checks such as the bank-transfer warning.
  const description = productRegion.querySelector<HTMLElement>('[data-testid*="description"], [data-testid*="item-description"]')?.textContent ?? detailsText;
  const gallery = documentRoot.querySelector<HTMLElement>('[data-testid^="item-photo-"]:not([data-testid*="--"])')
    ?? documentRoot.querySelector<HTMLElement>('[data-testid*="gallery"]')
    ?? documentRoot.querySelector<HTMLImageElement>('img')?.parentElement
    ?? price?.parentElement
    ?? productRegion;
  return {
    host: price.parentElement ?? productRegion,
    badgeHost: gallery,
    text: `${model} ${storage} ${condition}`.trim(),
    description,
    itemPrice,
    buyerProtection: protection ? euroNumber(protection.textContent ?? '') : undefined,
    vintedTotal: displayedTotal
  };
}

export function collectSurfaces(documentRoot: Document = document): ListingSurface[] {
  const product = productSurface(documentRoot);
  if (product) return [product];
  const currentCards = currentListingSurfaces(documentRoot);
  if (currentCards.length > 0) return currentCards;
  return Array.from(documentRoot.querySelectorAll<HTMLElement>('[data-testid="item-box"], [data-testid^="item-box-"]'))
    .map((host) => ({ host, text: listingText(host), itemPrice: priceFrom(host) }));
}

export function fingerprint(surface: ListingSurface): string {
  return `${surface.text}|${surface.description ?? ''}|${surface.itemPrice ?? ''}|${surface.buyerProtection ?? ''}|${surface.vintedTotal ?? ''}`;
}

export function mountBadge(host: HTMLElement, margin: number | undefined, provider?: string): HTMLElement {
  let badge = host.querySelector<HTMLElement>(`:scope > .${BADGE_CLASS}`);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    host.style.position ||= 'relative';
    badge.style.cssText = 'position:absolute !important; top:8px !important; left:8px !important; right:auto !important; z-index:2147483647 !important; display:block !important; visibility:visible !important; opacity:1 !important; padding:4px 7px !important; border-radius:999px !important; color:#fff !important; font:700 12px/1.2 system-ui !important; pointer-events:none !important;';
    host.append(badge);
    host.addEventListener('mouseenter', () => {
      if (badge!.dataset.provider) badge!.textContent = `${badge!.dataset.marginLabel} · ${badge!.dataset.provider}`;
    });
    host.addEventListener('mouseleave', () => { badge!.textContent = badge!.dataset.marginLabel ?? ''; });
  }
  const state: MarginState = marginState(margin);
  badge.dataset.state = state;
  badge.dataset.marginLabel = formatMargin(margin);
  badge.textContent = badge.dataset.marginLabel;
  const source = margin === undefined || !provider ? undefined : provider;
  badge.dataset.provider = source ?? '';
  badge.setAttribute('aria-label', margin === undefined ? 'Marge inconnue' : `Marge estimée ${formatMargin(margin)}${source ? `, offre ${source}` : ''}`);
  // `pointer-events: none` keeps Vinted card links clickable, while the native
  // tooltip on the image/card host reveals the selected buyer on hover.
  if (source) host.title = `Meilleure offre : ${source}`;
  else host.removeAttribute('title');
  badge.style.setProperty('background', state === 'positive' ? '#087f23' : state === 'negative' ? '#b42318' : '#667085', 'important');
  return badge;
}

/** A scam warning replaces the valuation badge, preserving one overlay per surface. */
export function mountScamBadge(host: HTMLElement): HTMLElement {
  const badge = mountBadge(host, undefined);
  badge.dataset.state = 'scam';
  badge.dataset.marginLabel = 'Scam';
  badge.dataset.provider = '';
  badge.textContent = 'Scam';
  badge.setAttribute('aria-label', 'Alerte arnaque : virement bancaire');
  badge.style.setProperty('background', '#b42318', 'important');
  return badge;
}

export function renderMargin(surface: ListingSurface, quote: number | undefined, provider?: string): HTMLElement {
  const margin = surface.vintedTotal === undefined
    ? calculateMargin({ quote, itemPrice: surface.itemPrice, buyerProtection: surface.buyerProtection })
    : calculateMarginFromTotal(quote, surface.vintedTotal, surface.itemPrice);
  return mountBadge(surface.badgeHost ?? surface.host, margin, provider);
}
