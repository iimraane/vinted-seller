export type MarginState = 'positive' | 'negative' | 'unknown';

export interface MarginInput {
  quote: number | undefined;
  itemPrice: number | undefined;
  buyerProtection?: number;
}

export const DELIVERY_ALLOWANCE = 5;
export const BUYER_PROTECTION_RATE = 0.05;
export const BUYER_PROTECTION_FIXED_FEE = 0.7;

/** Vinted's French buyer-protection price when the page has not rendered the total yet. */
export function estimatedBuyerProtection(itemPrice: number): number {
  return itemPrice * BUYER_PROTECTION_RATE + BUYER_PROTECTION_FIXED_FEE;
}

export function calculateMargin(input: MarginInput): number | undefined {
  if (input.quote === undefined || input.itemPrice === undefined) return undefined;
  const protection = input.buyerProtection ?? estimatedBuyerProtection(input.itemPrice);
  return plausibleMargin(Math.round(input.quote - input.itemPrice - protection - DELIVERY_ALLOWANCE), input.itemPrice);
}

/** Uses Vinted's displayed all-in price (item + buyer protection) when available. */
export function calculateMarginFromTotal(quote: number | undefined, vintedTotal: number | undefined, itemPrice?: number): number | undefined {
  if (quote === undefined || vintedTotal === undefined) return undefined;
  const margin = Math.round(quote - vintedTotal - DELIVERY_ALLOWANCE);
  return itemPrice === undefined ? margin : plausibleMargin(margin, itemPrice);
}

/**
 * A resale estimate far above the listed price is almost certainly a wrong
 * listing or provider match. Keep the provider result private in that case.
 */
export function plausibleMargin(margin: number | undefined, itemPrice: number | undefined): number | undefined {
  if (margin === undefined || itemPrice === undefined) return undefined;
  return margin > itemPrice * 1.5 ? undefined : margin;
}

export function marginState(margin: number | undefined): MarginState {
  if (margin === undefined) return 'unknown';
  return margin >= 0 ? 'positive' : 'negative';
}

export function formatMargin(margin: number | undefined): string {
  if (margin === undefined) return '?';
  return `${margin > 0 ? '+' : ''}${margin} €`;
}
