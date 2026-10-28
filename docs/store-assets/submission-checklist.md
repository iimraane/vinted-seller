# Chrome Web Store submission checklist

## Upload and listing

- [ ] Run `npm run package:chrome` and upload `release/vinted-phone-margin-extension.zip`.
- [ ] Use the French title and descriptions in `docs/chrome-web-store-listing.fr.md`.
- [ ] Add `vinted-listing-margin.png` as the Store screenshot.
- [ ] Leave optional public support and privacy contact fields blank. If Chrome requires one, stop and obtain a real public contact from the owner.
- [ ] Request the owner's confirmation immediately before selecting the Chrome Web Store public release control.

## Privacy disclosure

- [ ] Chrome Web Store Privacy Practices: declare Vinted listing content is accessed only to read model, condition, storage, and price; it is not sold or used for advertising.
- [ ] Chrome Web Store Privacy Practices: declare no personally identifiable information, financial/payment information, authentication information, messages, or contacts are collected by the extension.
- [ ] Chrome Web Store Privacy Practices: declare `storage` is used only for local successful quote reuse for up to 24 hours.
- [ ] Host permissions justification: `vinted.fr`/`vinted.com` inject the read-only badge; Easy Cash and Cash Express are contacted only for public buy-back estimates.
- [ ] Cash Express request note: browser-session credentials are included only for its temporary estimate basket, which the extension then removes; no Vinted credentials are sent.
- [ ] Declare that the extension reads only the visible listing information needed for an estimate: model, condition, storage, and price.
- [ ] Declare that only device attributes required for a public buy-back estimate are sent to Easy Cash and Cash Express.
- [ ] Declare that Vinted account, payment, contact, and message data are never sent.
- [ ] Declare that successful quotes are cached locally for 24 hours to avoid repeated provider requests.
- [ ] Describe estimates as non-binding and the extension as independent of Vinted, Easy Cash, and Cash Express.
