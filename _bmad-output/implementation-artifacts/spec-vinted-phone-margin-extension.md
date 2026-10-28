---
title: 'Vinted Phone Margin Extension'
type: 'feature'
created: '2026-10-17'
status: 'done'
route: 'dispatch'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A reseller browsing Vinted has to manually compare each iPhone or Samsung listing with current buy-back offers, making viable deals easy to miss. The comparison must remain useful as buy-back quotations fluctuate during the day.

**Approach:** Deliver a Chrome extension limited to Vinted that identifies supported phone listings, retrieves current buy-back valuations autonomously from Easy Cash and Cash Express, and overlays a clearly positive or negative estimated margin on both catalogue cards and listing pages.

## Boundaries & Constraints

**Always:** Support iPhone and Samsung devices only; initially retrieve buy-back values from Easy Cash and Cash Express, with source adapters designed for later providers; choose the best usable provider quote; calculate margin as that quote minus the Vinted item price including buyer protection plus a fixed €5 delivery allowance; show a green badge when the computed margin is zero or greater and a red badge when it is negative; make the same calculation visible in Vinted search/catalogue results and on an individual listing page; refresh valuation data frequently enough to reflect intraday changes; do not require the user to key in buy-back prices. Use only model, condition, and storage for valuation: missing storage means the smallest available storage; missing condition means `good condition`; unknown model means a grey `?` badge.

**Never:** Change Vinted data or submit, message, reserve, or purchase listings; use Back Market or another buy-back source in the first release; use other phone brands in the first release; estimate a monetary margin when the model is unknown.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Supported catalogue item | A Vinted card resolves to an iPhone or Samsung model and a current Easy Cash or Cash Express quote | Overlay the rounded best-provider margin as `+10 €`, `0 €`, or `-10 €`; green for non-negative, red otherwise | Badge must not obscure the listing price or navigation controls |
| Supported product page | The page resolves to the same kind of matched device and valuation | Show the same-margin badge near the primary price information, using item price + buyer protection + €5 delivery | Recalculate from the current page price rather than reusing a stale card price |
| Unknown model | The title or page cannot resolve a specific iPhone or Samsung model | Show a grey `?` badge | Do not calculate or imply a monetary margin |
| Missing storage or condition | Model is known but one or both attributes are absent | Use the smallest available storage and/or `good condition` | Continue only if the source adapter can yield a quote for the resulting variant |
| Source unavailable | One or more valuation sources fail or return no quote | Use the other provider when it has a usable quote; otherwise show no monetary badge | Keep Vinted usable and retry according to the refresh/cache policy |

</frozen-after-approval>

## Code Map

- No application files, package manifest, test setup, or Chrome extension scaffold currently exist; initialise all runtime and test files for this feature.
- `_bmad/` -- workflow infrastructure only; do not modify its generated render snapshots or managed configuration.
- `_bmad-output/implementation-artifacts/spec-vinted-phone-margin-extension.md` -- implementation contract for this feature.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `tsconfig.json`, and extension build configuration -- initialise a Manifest V3 TypeScript Chrome extension and reproducible development/test commands -- provides the empty repository's runtime baseline.
- [x] `src/manifest.json`, `src/content/index.ts`, and `src/content/vinted-dom.ts` -- run only on Vinted, detect catalogue cards and product pages, observe client-side navigation, and mount/update/remove non-intrusive badges -- supplies both requested surfaces without affecting non-Vinted sites.
- [x] `src/domain/device.ts` and `src/domain/margin.ts` -- parse iPhone/Samsung listing data into model, condition, and storage; apply `good condition`/smallest-storage fallbacks; calculate the best-provider quote minus Vinted price, buyer protection, and €5 delivery -- keeps business rules independent from the DOM.
- [x] `src/valuation/*` and `src/background/*` -- implement Easy Cash and Cash Express adapters, quote normalization, best-quote selection, an intraday cache/refresh policy, source-failure handling, and extension messaging -- obtains buy-back values automatically without user-entered prices and leaves a provider extension point.
- [x] `src/content/*.test.ts`, `src/domain/*.test.ts`, and `src/valuation/*.test.ts` -- test matching, margin colours/rounding, grey unknown-model state, condition/storage fallbacks, source failure, and dynamic Vinted content -- protects the critical decision path.
- [x] `README.md` -- document local build/loading, supported devices, source/caching behaviour, and known limitations -- lets the owner validate the first release.

**Acceptance Criteria:**
- Given a supported iPhone or Samsung catalogue listing with usable Easy Cash and/or Cash Express valuation, when Vinted renders or dynamically adds its card, then exactly one badge shows the current signed margin from the best usable quote and the correct green/red state.
- Given the user opens a supported listing from the catalogue, when its product page becomes available, then a badge shows the margin computed using that page's displayed price.
- Given a listing has no identifiable phone model, when the extension evaluates it, then it renders a grey `?` badge and no monetary margin; given only storage or condition is missing, then it uses the approved fallback before valuing it.
- Given a supported listing's valuation changes after the configured refresh period, when the extension reevaluates the listing, then its displayed margin reflects the updated valuation without manually entering a buy-back price.

## Implementation Notes

## Spec Change Log

## Review Triage Log

- medium — `src/content/index.ts` fingerprints a failed valuation before the asynchronous request resolves, preventing retries for unchanged cards; source failure must remain retryable. Route: patch.
- medium — `src/content/index.ts` has no scheduled re-evaluation after the 15-minute cache expiry, so an unchanged Vinted view can retain stale margins. Route: patch.
- medium — `src/content/index.ts` can apply a delayed quote to a connected but repurposed Vinted card because it does not re-check the fingerprint. Route: patch.
- false — `pushstate` is not dispatched as a browser event, but the mutation observer observes the DOM changes necessary for Vinted route content to become visible; this listener is redundant, not the cause of missed rendered content. Route: reject.
- medium — `src/content/vinted-dom.ts` can select a non-item euro amount as a listing price, producing a wrong margin. Route: patch.
- medium — `src/content/vinted-dom.ts` can promote a generic `/items/` link to a shared container and render one badge for multiple cards. Route: patch.
- medium — `src/content/vinted-dom.ts` uses broad product-page price/protection matching and can select recommendation or duplicate data. Route: patch.
- medium — `src/valuation/providers.ts` has no request timeout, so one hung provider blocks delivery of the other provider's usable quote. Route: patch.
- medium — `src/valuation/providers.ts` can interpret arbitrary HTML euro amounts as buy-back values rather than a verified source quote. Route: patch.
- medium — `src/valuation/normalization.ts` falls back to an explicitly different condition when the requested condition has no matching offer. Route: patch.
- medium — `src/valuation/normalization.ts` substitutes a different storage size when Vinted supplied a known size missing from the provider data. Route: patch.
- medium — `src/background/index.ts` sends duplicate simultaneous requests for identical device keys before caching completes, increasing rate-limit risk. Route: patch.
- medium — `src/content/index.ts` can overwrite a reused connected card with its prior listing's quote; a post-await fingerprint check is required. Route: patch.
- medium — `src/content/index.ts` never reevaluates an unchanged surface after cache expiry, contradicting the intraday refresh claim. Route: patch.
- medium — `src/content/vinted-dom.ts` misclassifies a product page containing recommendation cards as a catalogue because product-page detection excludes pages with item boxes. Route: patch.
- medium — `src/content/vinted-dom.ts` evaluates full product-page body text, allowing a supported phone in surrounding/recommendation text to value an unknown listing. Route: patch.
- medium — `src/valuation/normalization.ts` uses a different known storage capacity when an exact requested capacity is unavailable. Route: patch.
- medium — `src/valuation/normalization.ts` uses a provider offer marked with a different condition instead of rejecting it. Route: patch.
- medium — `src/valuation/normalization.ts` permits prefix model matches such as a base phone using a Pro/Plus quote. Route: patch.
- medium — `src/valuation/providers.ts` lets one never-settling provider request block `bestQuote`. Route: patch.
- medium — the content script has no executable observer/message/render integration test, leaving its primary runtime flow unverified. Route: patch.
- medium — the background `GET_VALUATION` message contract and cache write/hit path have no executable test. Route: patch.
- medium — Easy Cash/Cash Express adapter requests and response parsing have no mocked-fetch tests. Route: patch.

## Design Notes

The extension should separate volatile source adapters from stable Vinted parsing and margin calculation. A background context owns quote refresh/caching; content scripts receive a normalized quote and only render the overlay. The selected quote is the highest usable Easy Cash/Cash Express quote, making each additional provider a contained adapter rather than a UI rewrite.

## Verification

**Commands:**
- `npm test` -- expected: unit and DOM tests pass.
- `npm run build` -- expected: a loadable unpacked Manifest V3 extension is emitted without TypeScript errors.

**Manual checks (if no CLI):**
- Load the unpacked extension in Chrome, inspect a Vinted catalogue and a product page, and confirm the badge placement, signed value, colour, and no-badge fallbacks.
