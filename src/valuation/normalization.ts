import type { Device } from '../domain/device';
import type { RemoteOffer, Quote } from './types';

const comparable = (value: string | undefined) => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Chooses the requested variant, or the smallest capacity offered when absent. */
export function selectOffer(device: Device, offers: RemoteOffer[], provider: string, now = Date.now()): Quote | undefined {
  const matchingModel = offers.filter((offer) => offer.amount >= 0 &&
    comparable(offer.model) === comparable(device.model));
  // A source must explicitly identify the variant condition; guessing a different
  // condition is worse than returning no quote.
  const matchingCondition = matchingModel.filter((offer) =>
    offer.condition !== undefined && comparable(offer.condition) === comparable(device.condition));
  const candidates = device.storage === undefined
    ? matchingCondition.filter((offer) => offer.storage !== undefined)
    : matchingCondition.filter((offer) => offer.storage === device.storage);
  if (!candidates.length) return undefined;

  const offer = device.storage === undefined
    ? [...candidates].sort((a, b) => (a.storage ?? Infinity) - (b.storage ?? Infinity))[0]
    : candidates[0];
  return { provider, amount: offer.amount, fetchedAt: now };
}

/** Accepts common API and JSON-LD shapes without coupling the extension to a provider UI. */
export function offersFromPayload(payload: unknown): RemoteOffer[] {
  const offers: RemoteOffer[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const labelledAsBuyback = record.buybackPrice !== undefined || record.isBuyback === true ||
      (typeof record.type === 'string' && /buyback|reprise|rachat/i.test(record.type));
    const rawAmount = labelledAsBuyback ? (record.buybackPrice ?? record.amount ?? record.price ?? record.value) : undefined;
    const amount = typeof rawAmount === 'number' ? rawAmount : Number(String(rawAmount ?? '').replace(',', '.').replace(/[^0-9.]/g, ''));
    const model = record.model ?? record.name ?? record.title ?? record.productName;
    if (typeof model === 'string' && Number.isFinite(amount) && amount > 0) {
      const rawStorage = record.storage ?? record.capacity ?? record.memory;
      const storage = typeof rawStorage === 'number' ? rawStorage : Number(String(rawStorage ?? '').replace(/[^0-9]/g, '')) || undefined;
      offers.push({ model, storage, condition: typeof record.condition === 'string' ? record.condition : undefined, amount });
    }
    Object.values(record).forEach(visit);
  };
  visit(payload);
  return offers;
}
