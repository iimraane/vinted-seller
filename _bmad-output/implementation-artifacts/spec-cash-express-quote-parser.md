---
title: 'Cash Express Displayed Quote Parser'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Cash Express margin for an iPhone 13 can use an unsupported €305.70 amount even though Cash Express visibly quotes €210 for `IPHONE 13 5G 128GO` in `Très bon état`. The Vinted margin arithmetic is consequently correct but based on the wrong input.

**Approach:** Parse the created Cash Express basket line using its displayed line-item buy-back price, never the order total or an intermediate estimate. Preserve `Très bon état` as the existing `intact` condition mapping.

</frozen-after-approval>

## Implementation Notes

- Live basket inspection on 2026-10-17 found several pre-existing temporary items. The iPhone 13 line has `data-cart-item` and renders the authoritative amount in `.purchase-cart-item__price` as `210 €`; the page-level `[data-total-estimated]` is the aggregate basket amount (`1 585,48 €`) and must not be used for one line.
- `CashExpressProvider.price()` currently scopes HTML with a same-tag regular expression and searches for `[data-total-estimated]`. Real item cards are nested `div`s, so that approach cannot reliably bound the item and does not target the provider's visible line price.
- Changed `src/valuation/providers.ts` to match the complete created basket item with balanced same-tag traversal, then accept exactly one `.purchase-cart-item__price` value. It no longer considers page totals or `[data-total-estimated]` values.
- Updated `src/valuation/providers.test.ts` with the reported 305.70-versus-210 regression and nested `div` basket fixtures. Focused provider tests pass (18 tests).
- Versioned the quote-cache key to invalidate the previously parsed quote for up to one 24-hour TTL, and made the visible-price reader tolerate nested price markup. Comments and scripts are removed before nesting is counted.
- Final verification: `npm test` passes 59 tests and `npm run build` passes.

## Review Triage Log

- medium — Existing cached €305.70 quotes would otherwise survive for 24 hours. Patched with the `valuation:v2` key and the existing cache-hit test now proves the new namespace is used.
- medium — A visible price wrapped in markup could be missed. Patched by extracting one amount from the complete `.purchase-cart-item__price` element; the €210 regression now uses a nested `strong` element.
- medium — Literal nested tags in comments/scripts could corrupt same-tag depth tracking. Patched by removing those inert blocks before locating the item.
- medium — When `add-to-cart` returns no line ID, a single pre-existing user basket line could be read/removed, or a multi-line basket cannot be safely quoted. Pre-existing behavior, deferred because reliable before/after correlation is broader than this parser correction.
- maybe-false — Broad `basketIds()` keys could select a catalogue identifier instead of a basket-line identifier. The available response fixtures and live basket page do not prove this shape; deferred pending an observed add-to-cart response containing both IDs.
