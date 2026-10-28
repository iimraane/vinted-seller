import { describe, expect, it } from 'vitest';
import { calculateMargin, calculateMarginFromTotal, estimatedBuyerProtection, formatMargin, marginState } from './margin';

describe('margin', () => {
  it('deducts buyer protection and the fixed delivery allowance, then rounds', () => {
    expect(calculateMargin({ quote: 100, itemPrice: 83.4, buyerProtection: 6.2 })).toBe(5);
  });
  it('estimates Vinted buyer protection for catalogue cards without a displayed total', () => {
    expect(estimatedBuyerProtection(100)).toBe(5.7);
    expect(calculateMargin({ quote: 120, itemPrice: 100 })).toBe(9);
  });
  it('does not deduct buyer protection twice when Vinted provides the all-in total', () => {
    expect(calculateMarginFromTotal(120, 105.7)).toBe(9);
  });
  it('uses green semantics for zero and red semantics below zero', () => {
    expect(marginState(0)).toBe('positive');
    expect(marginState(-1)).toBe('negative');
    expect(formatMargin(10)).toBe('+10 €');
  });
  it('hides only a profit strictly above 1.5 times the listed price', () => {
    expect(calculateMargin({ quote: 260.7, itemPrice: 100, buyerProtection: 5.7 })).toBe(150);
    expect(calculateMargin({ quote: 261.7, itemPrice: 100, buyerProtection: 5.7 })).toBeUndefined();
  });
});
