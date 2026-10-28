import { hasSafetyExclusion, parseDevice } from '../domain/device';
import { QUOTE_TTL_MS } from '../background/cache';
import { BADGE_CLASS, collectSurfaces, fingerprint, mountBadge, mountScamBadge, renderMargin } from './vinted-dom';

const RECHECK_MS = 60_000;
// Cash Express may need to create and clear a temporary basket. Eight seconds
// can expire while that normal provider flow is still completing, producing a
// missing badge despite a valid quote. Keep the page-side listener alive long
// enough for the provider request, while the background cache still prevents
// repeated work for 24 hours.
const RUNTIME_RESPONSE_TIMEOUT_MS = 30_000;

const completed = new WeakMap<HTMLElement, string>();
const successful = new WeakMap<HTMLElement, { fingerprint: string; expiresAt: number }>();
const visible = new WeakSet<HTMLElement>();
const pending = new WeakSet<HTMLElement>();

function isPhoneCandidate(text: string): boolean {
  return /\b(?:iphone|samsung|galaxy)\b/i.test(text);
}

function hasBankTransferWarning(description: string | undefined): boolean {
  return /\bvirement\s+bancaire\b/i.test(description ?? '');
}

interface ValuationResponse {
  quote?: number;
  provider?: string;
  fetchedAt?: number;
}

function getQuote(device: NonNullable<ReturnType<typeof parseDevice>>): Promise<ValuationResponse | undefined> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(undefined), RUNTIME_RESPONSE_TIMEOUT_MS);
    chrome.runtime.sendMessage({ type: 'GET_VALUATION', device }, (response?: ValuationResponse) => {
      window.clearTimeout(timer);
      if (chrome.runtime.lastError) {
        console.warn('[Vinted Phone Margin] Valuation unavailable:', chrome.runtime.lastError.message);
        resolve(undefined);
        return;
      }
      resolve(response?.quote === undefined ? undefined : response);
    });
  });
}

async function evaluateSurface(surface: ReturnType<typeof collectSurfaces>[number]): Promise<void> {
  const initialFingerprint = fingerprint(surface);
  const priorSuccess = successful.get(surface.host);
  if (priorSuccess && priorSuccess.fingerprint === initialFingerprint && Date.now() < priorSuccess.expiresAt) return;
  if (priorSuccess) successful.delete(surface.host);
  if (completed.get(surface.host) === initialFingerprint || pending.has(surface.host)) return;
  // This warning is intentionally narrowly scoped: "virement" by itself is
  // common prose, while the requested contiguous phrase is a safety signal.
  if (hasBankTransferWarning(surface.description)) {
    mountScamBadge(surface.badgeHost ?? surface.host);
    completed.set(surface.host, initialFingerprint);
    return;
  }
  if (hasSafetyExclusion(surface.description ?? '')) {
    completed.set(surface.host, initialFingerprint);
    return;
  }
  // Do this before parsing the model: a case labelled "iPhone 15" must not
  // be mistaken for an actual iPhone 15.
  if (!isPhoneCandidate(surface.text)) {
    completed.set(surface.host, initialFingerprint);
    return;
  }
  // Vinted cannot show a meaningful purchase margin until a listed price has
  // rendered. Avoid both a provider journey and a misleading monetary pill.
  if (surface.itemPrice === undefined) {
    completed.set(surface.host, initialFingerprint);
    return;
  }
  pending.add(surface.host);
  const device = parseDevice(surface.text);
  if (!device) {
    mountBadge(surface.badgeHost ?? surface.host, undefined);
    completed.set(surface.host, initialFingerprint);
    pending.delete(surface.host);
    return;
  }
  try {
      const valuation = await getQuote(device);
    const current = collectSurfaces().find((candidate) => candidate.host === surface.host);
    if (current && fingerprint(current) === initialFingerprint) {
      // A missing live valuation is not an unknown model. The product contract
      // reserves the grey question mark for model recognition failures only.
      if (valuation) {
        renderMargin(current, valuation.quote!, valuation.provider);
        const fetchedAt = valuation.fetchedAt;
        if (Number.isFinite(fetchedAt) && fetchedAt! <= Date.now()) {
          successful.set(surface.host, { fingerprint: initialFingerprint, expiresAt: fetchedAt! + QUOTE_TTL_MS });
        }
      } else {
        // Keep the visual contract intact when a provider is temporarily
        // unavailable. This surface remains retryable; a later quote replaces
        // the neutral question mark without being cached as a failure.
        mountBadge(current.badgeHost ?? current.host, undefined);
      }
    }
  } catch {
    // Do not cache a failed request: mutations and timed refreshes may retry it.
  } finally {
    pending.delete(surface.host);
  }
}

async function evaluate(): Promise<void> {
  const surfaces = collectSurfaces();
  // IntersectionObserver can be delayed while Vinted hydrates its virtualised
  // grid. Revisit every discovered card until it has actually been observed.
  const observed = surfaces.filter((surface) => visible.has(surface.host));
  const candidates = /\/items\/\d+/.test(location.pathname)
    ? surfaces
    : observed.length > 0 ? observed : surfaces;

  // Each quote involves a short provider flow. Parallel cards avoid one
  // unavailable old model blocking every newer phone visible on screen.
  await Promise.all(candidates.map(evaluateSurface));
}

const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) visible.add(entry.target as HTMLElement);
  }
  schedule();
}, { rootMargin: '250px' });

let queued = false;
let scheduleTimer: number | undefined;
function schedule(): void {
  if (queued) return;
  queued = true;
  scheduleTimer = window.setTimeout(() => {
    scheduleTimer = undefined;
    queued = false;
    for (const surface of collectSurfaces()) {
      if (observer) observer.observe(surface.host);
      else visible.add(surface.host);
    }
    void evaluate();
  }, 100);
}

new MutationObserver((mutations) => {
  // Rendering a badge changes the DOM too. Debouncing plus the `pending` set
  // makes those changes harmless, while retaining support for Vinted's
  // infinite-scroll cards.
  if (mutations.some((mutation) => {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    return !target?.closest(`.${BADGE_CLASS}`);
  })) schedule();
}).observe(document.documentElement, {
  childList: true, characterData: true, attributes: true, subtree: true,
  attributeFilter: ['data-testid', 'title', 'aria-label']
});
window.addEventListener('popstate', schedule);
window.addEventListener('pushstate', schedule);
schedule();
// Failed or timed-out content requests remain retryable before the 24-hour
// provider-cache lifetime; a successful background request still reuses cache.
window.setInterval(schedule, RECHECK_MS);
