---
title: 'Provider Hardening for Vinted Phone Margin'
type: 'feature'
created: '2026-10-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'NO_VCS'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The extension currently obtains buy-back estimates only from Easy Cash even though it advertises Cash Express too. Its live-page integration and model recognition can silently regress when either provider or Vinted changes its markup.

**Approach:** Add a real Cash Express buy-back adapter that follows the public estimator and reads its displayed offer, strengthen provider failure reporting and diagnostics, broaden explicit iPhone/Samsung recognition, and verify the public provider contracts without creating a sale or changing external data.

## Boundaries & Constraints

**Always:** Use only the model, storage and Vinted condition to obtain a quote; use the price displayed by each provider's own estimator, never infer buy-back prices from its retail listings; retain the best usable provider quote; preserve the 15-minute cache and non-mutating Vinted behavior; keep source failure non-fatal and observable; test all deterministic provider branches with mocked responses. Cash Express may create then immediately remove its 30-minute temporary estimate basket solely to read the displayed offer; it must never submit or finalise a sale.

**Never:** Submit an order, leave a Cash Express estimate basket behind, send personal data, scrape retailer sale prices as a replacement for a buy-back offer, or represent an unavailable quote as a zero or an invented margin.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Cash Express quote | A supported device has a matching public estimator route and eligible answers | Create an estimate basket, read the displayed monetary offer, remove the basket, and return the quote attributed to Cash Express | Never derive a quote from catalogue/retail prices; remove the temporary basket even if its page cannot be parsed |
| Variant fallback | Storage is absent | Select the provider's smallest offered capacity | Return no Cash Express quote when no capacity is available |
| Provider outage or contract change | HTTP error, timeout, malformed response or unknown source status | Easy Cash can still provide the best quote; the failure is logged with the provider and reason | Return no monetary result only if all providers fail |
| New supported model spelling | A current iPhone or Galaxy listing uses an explicitly-supported suffix/model family | Parse its exact canonical model and preserve its storage and condition | Reject accessories and unsupported/ambiguous titles |
| Live read-only validation | Public source endpoints are reachable | Diagnostic confirms expected response contracts without mutation | Diagnostic fails clearly and is excluded from deterministic unit tests |

</frozen-after-approval>

## Code Map

- `src/valuation/providers.ts` -- owns provider requests, timeouts, the Easy Cash adapter, the Cash Express placeholder and best-quote selection; extend it without using retail catalogue prices.
- `src/valuation/types.ts` -- source-independent quote/provider contract; add bounded diagnostic metadata only if it stays outside the content-script price contract.
- `src/domain/device.ts` -- strict title parsing and canonical model names; expand exact iPhone/Galaxy variants while retaining the accessory exclusion.
- `src/background/index.ts` -- cache and message boundary; preserve its in-flight de-duplication and make cache/provider failure reporting non-blocking.
- `src/valuation/providers.test.ts` and `src/domain/device.test.ts` -- mocked contract, timeout/fallback and model-coverage tests.
- `README.md` -- document exact provider behavior, source limitations, supported model families and the read-only validation command.
- `package.json` -- expose a manual diagnostic command only if it avoids running provider network calls as part of normal tests.

## Tasks & Acceptance

**Execution:**
- [x] `src/valuation/providers.ts` and `src/valuation/types.ts` -- implement the public Cash Express estimator request sequence, parse only its buy-back offer, normalize provider errors/timeouts, and expose safe diagnostic status -- restores the advertised two-provider valuation path.
- [x] `src/background/index.ts` -- treat cache read/write failures as recoverable, retain a usable quote from either provider, and log source-unavailability details without exposing them as a price -- keeps the extension useful and diagnosable.
- [x] `src/domain/device.ts` -- add current explicit iPhone and Samsung Galaxy model formats with strict canonicalization and accessory guards -- prevents current legitimate listings from becoming unknown.
- [x] `src/valuation/providers.test.ts`, `src/background/index.test.ts`, and `src/domain/device.test.ts` -- cover estimator contract parsing, exact model/capacity matching, timeout/failure isolation, cache failure recovery and current model spellings -- locks the critical paths without live-network flakiness.
- [x] `package.json`, a small diagnostic script if needed, and `README.md` -- provide an opt-in, read-only live provider contract check and describe expected non-mutating usage -- makes source drift discoverable.

**Acceptance Criteria:**
- Given a Cash Express estimator response for a matching phone, when the adapter evaluates it, then it returns the displayed buy-back quote and never a retail listing price.
- Given either provider times out, returns malformed data or is unavailable, when the other provider returns a valid quote, then the best valid quote is still displayed and the source failure is diagnosable.
- Given a current supported iPhone or Samsung Galaxy title, when its model is parsed, then only its exact model, storage and condition form the provider request; accessories and ambiguous text remain unquoted.
- Given a contributor runs ordinary tests/builds, when network access is unavailable, then deterministic tests continue to pass; given they opt into the live diagnostic, it performs only read-only provider requests and clearly reports drift.

## Implementation Notes

- Live inspection on 2026-10-17 confirmed Cash Express exposes a public smartphone estimator at `/revendre/smartphone`: brands, models and attributes are POSTed as `FormData` to the same endpoint with `action=getBrands`, `getModels`, `getAttributes` and `calculateGrade`. `action=add-to-cart` redirects to `/revendre/panier`, whose `[data-total-estimated]` element carries the buy-back offer. A real, authorised test for `APPLE / IPHONE 13 5G / 128Go` with the prudent `scratches/scratches/used` mapping displayed `160 €`; its temporary basket was removed through `action=remove-product` immediately afterwards.
- State mapping decision: `excellent condition` maps to `intact` screen/case and `used`; `good condition` maps to `scratches` screen/case and `used`; `fair condition` maps to `shock` screen/case and `used`. These deliberately do not claim a device is new or invoiced.
- The final integration follows Cash Express's actual XMLHttpRequest shape: `action` is a query parameter, the full estimator questionnaire is `FormData`, `add-to-cart` yields a JSON redirect, the basket page's `data-total-estimated` is parsed, then its `data-cart-item` is removed in `finally`.
- Verification on 2026-10-17: `npm test` passed 28 tests, `npm run build` passed, and `npm run check:providers` reached both public provider metadata contracts. Easy Cash's live iPhone 13 route, 128 Go/grade B link, and displayed `166,00` quote were read directly. Cash Express's authorised temporary estimate displayed `160 €` and was then removed.
- Final validation on 2026-10-17: the built extension was observed on the live Vinted catalogue with margins rendered on supported phone cards and no margin on accessory cards. A live `iPhone 7 sim HS` example revealed a missing guard, so `HS`, parts-only and repair-only titles are now deliberately unquoted; `npm test` then passed 37 tests and `npm run build` passed.

## Spec Change Log

## Review Triage Log

- medium — `QuoteCache` accepted future/invalid timestamps and could suppress refreshes. Patched: malformed or future `fetchedAt` values are now stale; cache tests cover the case.
- medium — an unanswered extension runtime message could leave a card pending forever. Patched: the content request has an 8-second timeout and clears pending state.
- medium — an undefined provider quote was marked evaluated for the refresh bucket. Patched: only a monetary quote marks the surface evaluated, so failures retry.
- medium — product-page metadata is read from broad `main` text and recommendation content could affect attributes. Deferred: it predates this change and needs a live Vinted DOM contract decision rather than a safe local selector change.
- medium — a changed Vinted all-in total did not alter the card fingerprint. Patched: `vintedTotal` now participates in the fingerprint and has a DOM test.
- medium — Cash Express estimates could collide through their shared session basket. Patched: estimator journeys are serialized and concurrency is tested.
- medium — a basket page network outage cannot expose its item ID, so deletion is impossible even though the estimate was created. Kept as a best-effort external-contract limitation: the provider expires the basket after 30 minutes; the ID is removed whenever the response or basket page exposes it.
- medium — terabyte capacity labels did not normalize. Patched: `TB` and `To` normalize to 1024 Go for matching and smallest-capacity selection.
- medium — `vinted.com` can use non-euro pricing while the formula is French. Deferred: this pre-existing internationalisation issue is outside the requested provider hardening and needs a product decision.
- medium — Easy Cash serialization had no distinct-device concurrency test. Patched: a deferred-request test proves the second lookup begins only after the first releases.
- medium — a provider timeout had no tested fallback through quote selection. Patched: fake-timer coverage confirms the usable provider quote and timeout diagnostic survive a hung peer.
- false — a changed card can remain unquoted after a pending request. The DOM mutation itself schedules reevaluation; the post-await fingerprint guard prevents stale data from being applied.
- medium — malformed Cash Express responses silently yielded no quote. Patched: required status/selection response shapes now throw source-specific diagnostics.

## Design Notes

Cash Express has a richer condition questionnaire than Vinted. The adapter should isolate that mapping from the transport flow, use a single bounded request helper, and accept a quote only from a source response whose status and price field explicitly denote a buy-back estimate. A manual diagnostic is deliberately opt-in because providers change their public flows and it must not make CI or ordinary local tests flaky.

## Verification

**Commands:**
- `npm test` -- expected: all deterministic unit and DOM tests pass.
- `npm run build` -- expected: TypeScript accepts the extension and Vite emits a loadable `dist`.
- `npm run check:providers` -- expected: opt-in read-only checks identify provider contract availability or report a specific source failure.

**Manual checks (if no CLI):**
- Load `dist` unpacked in Chrome, browse a Vinted catalogue and a product page for an exact supported device, and confirm a Cash Express/Easy Cash buy-back result is used without changing Vinted or initiating an external sale.
