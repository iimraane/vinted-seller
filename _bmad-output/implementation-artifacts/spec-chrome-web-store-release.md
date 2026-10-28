---
title: 'Chrome Web Store Release Assets'
type: 'feature'
created: '2026-10-18'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'NO_VCS'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Vinted Phone Margin has no product identity, Chrome icon declarations, release ZIP, or storefront copy, so it cannot be published as a clear, trustworthy Chrome extension.

**Approach:** Add a generated brand icon in Chrome-required sizes, update the Manifest V3 package and build to carry those assets, prepare concise French Chrome Web Store copy that transparently describes its valuation behavior, and upload the verified ZIP to the user's Chrome Web Store developer account.

## Boundaries & Constraints

**Always:** Preserve the extension's present read-only Vinted behavior; describe that it reads listing information and sends only device attributes needed for public buy-back estimates to Easy Cash and Cash Express; identify estimates as non-binding; build and validate the exact ZIP uploaded to Chrome.

**Never:** Claim an affiliation with Vinted, Easy Cash, or Cash Express; transmit account, payment, contact, or Vinted message data; invent public support or privacy contact details; replace the generated logo with a text or trademark logo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Release package | Successful production build | ZIP contains the `dist` contents, manifest and all declared icon sizes at its root | Packaging check fails if an icon or manifest asset is missing |
| Store listing | Chrome Web Store developer account and required public metadata | French title and description accurately explain supported phones, margin calculation and data flow | Pause before the final public publish action for confirmation |
| Store requirement | A public support/privacy URL or email is unavailable | Leave optional contact fields empty | Stop only if Chrome makes the field mandatory |

**Decision:** Leave all optional public support and privacy contact fields empty. If Chrome makes any of them mandatory, stop and ask the user rather than inventing a value.

</frozen-after-approval>

## Code Map

- `src/manifest.json` -- MV3 listing metadata; has no icon declarations today.
- `vite.config.ts` -- copies only the manifest into `dist`; must copy icon assets and support release validation.
- `scripts/check-dist.ts` -- existing production-build validation; extend to validate declared icon files and archive input.
- `scripts/package-chrome.ts` and `scripts/package-chrome.test.ts` -- deterministic archive entry point and an isolated executable regression test.
- `package.json` -- owns build scripts; add a deterministic release-archive script.
- `README.md` -- current public behavior and privacy baseline; source for truthful Store copy.
- `assets/` -- new generated logo and icon-size derivatives, not currently present in the project.
- `docs/store-assets/` -- Chrome Web Store screenshots captured from the extension in operation, plus listing submission checklist.

## Tasks & Acceptance

**Execution:**
- [x] `assets/`, `src/manifest.json`, and `vite.config.ts` -- add the approved transparent brand icon at all Chrome sizes, declare it in the manifest, emit it in `dist`, and validate PNG signatures/dimensions.
- [x] `scripts/check-dist.ts`, `scripts/package-chrome.ts`, `scripts/package-chrome.test.ts`, and `package.json` -- make a reproducible Chrome Web Store ZIP from `dist`, validate all manifest-declared scripts/assets, and execute archive production in an isolated regression test.
- [ ] `README.md`, `docs/chrome-web-store-listing.fr.md`, and `docs/store-assets/` -- add the final French Store copy, a direct screenshot of the working extension that meets Store dimensions, and a privacy-submission checklist describing local cache retention and required provider requests.
- [ ] Chrome Web Store developer dashboard -- upload the verified ZIP and complete the listing using the supplied public contact details; request final confirmation before public release.

**Acceptance Criteria:**
- Given a production build, when the release archive is created, then it contains the manifest, scripts and all declared 16/32/48/128 px icons at the archive root.
- Given a user reads the Chrome Web Store listing, when they evaluate the extension, then they can understand in French that it is independent, read-only on Vinted, and obtains public buy-back estimates from Easy Cash/Cash Express.
- Given the Store media requirements, when the listing is submitted, then at least one compliant screenshot depicts the extension working on Vinted and the disclosure checklist matches its actual data flow.
- Given the dashboard reaches its final publication control, when the package and metadata are valid, then the agent pauses for user confirmation immediately before making the public release.

## Implementation Notes

- A new transparent `logo-brand` asset was generated with the built-in image generation tool: a teal phone, mint growth arrow and resale tag, with no text or third-party logos.
- The repository has no icon assets, Chrome Store screenshots, archive script, public support URL, or privacy-policy URL. The current manifest uses host permissions for Vinted, Easy Cash and Cash Express.
- Added the 1280×800 Vinted catalogue screenshot supplied by the user, showing live margin badges, and locked its Store dimensions plus the disclosure checklist with a deterministic test.
- The available supplied screenshot contains stale implausible margins and will not be used for the public Store listing. A new vetted capture is required before upload.

## Spec Change Log

- Review iteration 1 — Chrome Web Store screenshots and submission disclosure checklist were absent despite the release intent. Expanded the release assets/tasks and verification surface to include compliant real screenshots, exact disclosure guidance, strict icon validation, and execution coverage for the archive entry point. KEEP: retain the transparent generated icon, deterministic archive behavior, truthful French listing copy, and no invented public contact fields.

## Review Triage Log

- false — `scripts/package-chrome.ts` imports `resolve` twice, but `npm run package:chrome` executed successfully and generated the verified archive in this workspace; clean up the redundant import during reimplementation.
- medium — Validation only checked icon file presence, not their PNG integrity/dimensions; Chrome Store could reject malformed assets. Added strict image validation to the rederived task.
- medium — No Store screenshot was prepared, preventing a complete listing. This is a bad-spec omission; added required real Store media.
- low — ZIP file-mode metadata may vary across environments. Rejected: the tested package is byte-reproducible in its release environment, and cross-umask normalization is disproportionate here.
- low — Validation reads only the first content-script entry. Rejected: the current manifest has one entry, and extension behavior has no other script declaration.
- medium — The listing lacks a submission-oriented privacy checklist. This is a bad-spec omission; added disclosure-checklist work based on actual cache retention and provider requests.
- false — The duplicate `resolve` import was reported independently by edge-case review; the release command executed successfully here, so it does not block packaging.
- medium — Automated tests did not execute the archive entry point. Added an isolated executable package regression test to the rederived task.
- medium — Store listing tests depended on the process working directory. Patched with a repository-relative path derived from the test module URL.
- medium — Screenshot validation accepted a truncated PNG after its header. Patched by asserting the terminal IEND marker in addition to the signature and dimensions.
- high — The available screenshot visibly shows stale implausible margins, so publishing it would misrepresent the current extension. Kept the task open and require a vetted new capture from the current build.
- medium — Cash Express sends browser-session credentials for its temporary estimate basket. Patched the listing and submission checklist to disclose that exact limited flow.
- medium — The copy implied cache entries were deleted after 24 hours, while they are only no longer reused. Patched the wording to state the actual reuse policy.
- medium — The submission checklist lacked field-level privacy and host-permission guidance. Patched with the concrete disclosure checklist.

## Design Notes

The icon uses clear resale-margin signals rather than Vinted or retailer marks. Its source remains high resolution so the Chrome sizes can be generated from one recognizable visual identity.

## Verification

**Commands:**
- `npm test` -- expected: existing deterministic behavior remains valid.
- `npm run build` -- expected: emitted manifest and all referenced assets are valid.
- `npm run package:chrome` -- expected: emits one upload-ready ZIP with `manifest.json` at archive root.

**Manual checks (if no CLI):**
- Open the ZIP and inspect the Chrome Web Store dashboard preview before requesting final publication confirmation.
