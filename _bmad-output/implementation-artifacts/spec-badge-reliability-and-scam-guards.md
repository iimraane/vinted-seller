---
title: 'Reliable Vinted Badges and Scam Guards'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'NO_VCS'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The extension can miss product-page badges, value packaging or misleading listings as phones, and display implausible margins. The supplied Vinted captures show an unmatched product-page model, a bank-transfer warning, an empty iPhone box, and a Cash Express margin inconsistent with its displayed estimate.

**Approach:** Make Vinted surface extraction attribute-led and resilient, add clear scam and plausibility guards, harden the Cash Express displayed-estimate extraction and cleanup, and retain a successfully obtained quote for 24 hours.

## Boundaries & Constraints

**Always:** Use the explicit Vinted product attributes as the preferred model/storage/condition source; use the Vinted description only for safety exclusions and the bank-transfer warning; show exactly one overlay per surface; select the highest usable Easy Cash/Cash Express displayed buy-back quote; calculate margin from Vinted's displayed all-in total when available; retain valid quotes for 24 hours; remove every Cash Express temporary basket whose ID can be discovered.

**Never:** Value an empty package, parts-only or non-phone listing; expose a monetary margin when profit exceeds 1.5 times the listed item price; make a purchase or leave a known Cash Express temporary basket intentionally; treat the word "virement" alone as a scam flag; use retail prices or invent a buy-back value.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Product page | Product attributes give `Galaxy A10`, 32 Go, Bon état while title says `Samsung A32` | Badge is anchored to the product gallery and valuation uses Galaxy A10 | Attribute absence falls back safely to title; no price means no monetary badge |
| Bank-transfer listing | Description contains contiguous `virement bancaire` | One visible scam pill is shown; no valuation request or margin badge | Similar non-contiguous text does not trigger it |
| Empty package | Description says an empty box/package or phone not included | No valuation request and no profit badge | Keep normal Vinted navigation intact |
| Implausible margin | Computed profit is strictly greater than 1.5× listed item price | Grey `?`, with no provider/amount disclosure | A profit exactly at the limit remains a normal margin |
| Cash Express basket | Successful estimator add-to-cart response and basket page | Read one displayed estimate from the created basket and remove its item in `finally` | Ambiguous or missing basket total is rejected and logged; cleanup is best effort only when no item ID is obtainable |
| Cached quote | Same device within 24 hours | Reuse the stored source/amount without a new estimator journey | Invalid/future timestamps and 24h-or-older entries are stale |

</frozen-after-approval>

## Code Map

- `src/content/vinted-dom.ts` -- `productSurface`, catalogue extraction, badge mounting and margin rendering; currently requires a narrow product price test-id, anchors the product badge beside price, and builds product text from title only.
- `src/content/index.ts` -- evaluation scheduling, candidate filter and runtime request; currently evaluates only an initial eight unobserved cards and must coordinate dedicated scam/unsupported rendering without a provider call.
- `src/domain/device.ts` -- strict phone/accessory/parts parsing; extend the safety-exclusion vocabulary for empty packaging without allowing description prose to override explicit product attributes.
- `src/domain/margin.ts` -- central margin calculation/state; add the item-price plausibility decision independently from provider transport.
- `src/valuation/providers.ts` -- Cash Express basket journey; replace broad whole-page total matching with the single created basket item's displayed estimate while preserving `finally` removal.
- `src/background/cache.ts` and `src/content/index.ts` -- duplicated 15-minute freshness values; replace with a shared 24-hour policy and keep timestamp guards.
- `src/content/vinted-dom.test.ts`, `src/content/index.test.ts`, `src/domain/device.test.ts`, `src/domain/margin.test.ts`, `src/background/cache.test.ts`, `src/valuation/providers.test.ts` -- deterministic DOM, scheduling, safety, TTL and basket-cleanup regression coverage.

## Tasks & Acceptance

**Execution:**
- [x] `src/content/vinted-dom.ts` and `src/content/index.ts` -- extract explicit product attributes/description from a bounded product region, anchor a complete product badge at the gallery, add a dedicated `Scam` pill for `virement bancaire`, and reliably revisit hydrated/visible cards -- fixes missing placement and prevents unsafe requests.
- [x] `src/domain/device.ts` and `src/domain/margin.ts` -- reject empty-package wording and expose the strict `profit > itemPrice * 1.5` unknown-margin rule -- prevents false valuations and absurd displays.
- [x] `src/background/cache.ts` and `src/content/index.ts` -- share a 24-hour quote freshness period while retaining retry behavior for failed requests -- eliminates needless source simulations without caching failures.
- [x] `src/valuation/providers.ts` -- isolate Cash Express's created basket item and its sole `[data-total-estimated]`, reject ambiguous totals, and retain cleanup in every discoverable-ID path -- makes displayed provider value trustworthy and preserves temporary-cart hygiene.
- [x] `src/content/*.test.ts`, `src/domain/*.test.ts`, `src/background/cache.test.ts`, and `src/valuation/providers.test.ts` -- cover product variants, scam/empty-package short circuits, hydrated cards, 24h boundary, €210 quote vs €137.20 total (`+68 €`), 1.5× threshold, and misleading Cash Express totals -- locks the supplied regressions.
- [x] `README.md` -- state the 24-hour quote lifetime, scam pill and implausible-margin safeguard -- keeps user-visible behavior documented.

**Acceptance Criteria:**
- Given a supported product page with real Vinted attribute rows, when it loads or hydrates, then one complete badge appears over its gallery using the attributes and the page's displayed price/total.
- Given a description with `virement bancaire` or an empty packaging statement, when the card/page is evaluated, then the scam pill or no valuation outcome respectively appears and no provider journey starts.
- Given Cash Express displays `210 €` for a listing whose Vinted all-in total is `137.20 €`, when the best quote is selected, then the badge displays `+68 €`; unrelated totals cannot be selected.
- Given a cached valid quote is 23:59 old, when the same device is revisited, then it is reused; given it is 24:00 old, then it is refreshed.

## Implementation Notes

- Product-page parsing now gives precedence to explicit Vinted model, storage and condition rows, mounts the overlay on the gallery, and limits description use to safety checks. Catalogue evaluation no longer stops after the first eight unobserved cards.
- `virement bancaire` creates a single red `Scam` pill and skips valuation. Empty-package, phone-excluded, parts and non-working wording likewise prevents source requests.
- Successful quotes use a shared 24-hour TTL. Failed requests stay retryable and never enter the cache.
- Cash Express now scopes its displayed total to the created basket item. It removes a known created item even when the basket page fails; if no creation ID exists and several basket items are present, it returns no quote and deliberately avoids touching another basket.
- Verification on 2026-10-17: `npm test` passed 49 tests, `npm run build` passed, and `npm run check:providers` passed with read-only public provider checks.
- Final verification on 2026-10-17: review fixes added provider request abortion, build-manifest validation, bounded price extraction and cache-expiry tracking. `npm test` passed 57 tests, `npm run build` validated the emitted manifest, and `npm run check:providers` passed.

## Spec Change Log

## Review Triage Log

- medium — a hydrated description could add or remove `virement bancaire` without changing a surface fingerprint. Patched: description now participates in the fingerprint and text/attribute mutations are observed.
- medium — cache freshness trusted malformed quote values. Patched: cache now requires a non-empty provider and finite positive amount as well as a valid timestamp.
- medium — a second review independently found cache-poisoning from non-finite or negative amounts. Patched by the same complete quote-shape validation; tests cover blank provider, zero, negative and `NaN` amounts.
- high — product pages could estimate buyer protection despite displaying a Vinted all-in total. Patched: bounded total selectors take precedence, with the €210 / €137.20 = +68€ regression covered.
- medium — a provider timeout could be mistaken for an unknown model in a later refactor without a test. Patched: timeout coverage asserts no badge is mounted and retry remains possible.
- medium — source tests did not prove the built manifest referenced emitted scripts. Patched: the normal build validates `dist/manifest.json`, entry files and Vinted matches.
- medium — repeated Vinted product IDs could retain an inner card instead of its stable outer card. Patched: outermost containment wins and is tested in both discovery orders.
- medium — calendar-bucket evaluation could retain a cached quote beyond its actual 24-hour age. Patched: background returns `fetchedAt` and content reevaluates at `fetchedAt + QUOTE_TTL_MS`.
- medium — a timed-out valuation could remain blank until page mutation. Patched: a 60-second UI recheck retries failures while successful responses continue using the 24-hour cache.
- false — native `pushstate` event delivery was claimed to be required for SPA routing. Vinted page changes necessarily mutate the observed document for a new surface to exist; browser back/forward still uses `popstate`.
- medium — in-place hydration of title, description or attributes was not observed. Patched: the observer includes character data and relevant attribute mutations.
- medium — Cash Express could reject a Samsung model when its label omitted the `Samsung` prefix. Patched: matching normalizes that brand prefix after brand selection and a Galaxy regression passes.
- false — the basket-item regex was claimed to truncate ordinary nested basket markup. It closes only on a nested element with the same tag as the basket item; ordinary nested `div`/`span` markup is retained, and strict single-total tests cover the estimate container.
- medium — timed-out fetches could continue an estimator request after cleanup. Patched: every provider request now receives an `AbortSignal`, with timeout-abort coverage.
- medium — first/second euro amounts in a card title could be a crossed-out price or shipping amount. Patched where dedicated Vinted price/total fields exist; accessible-title fallback remains only for legacy cards and is covered by existing Vinted title fixtures.

## Design Notes

Keep provider results and Vinted presentation separate: provider extraction establishes a trustworthy displayed buy-back amount; the domain validates arithmetic plausibility; the content layer decides placement and safety signals. The user-facing `Scam` pill is independent of valuation and deliberately only matches the requested phrase.

## Verification

**Commands:**
- `npm test` -- expected: all deterministic provider, cache, domain and DOM regressions pass.
- `npm run build` -- expected: TypeScript accepts the extension and Vite emits loadable scripts.
- `npm run check:providers` -- expected: public provider metadata contracts remain reachable without creating a basket.

**Manual checks (if no CLI):**
- Reload the unpacked extension, inspect a real product page and a long Vinted catalogue, and verify gallery placement, `Scam` treatment, no box-only valuation, source tooltip, and one badge per supported listing.
