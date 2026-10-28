export type Brand = 'iphone' | 'samsung';

export interface Device {
  brand: Brand;
  /** Canonical source-query model, e.g. "iPhone 13" or "Samsung Galaxy S22". */
  model: string;
  /** Undefined deliberately asks an adapter to use its least-capacity variant. */
  storage?: number;
  condition: 'good condition' | string;
}

const iphonePattern = /\b(iPhone\s+(?:(?:SE\s*(?:\(?20(?:16|20|22)\)?)?)|(?:Air|\d{1,2}e?|X(?:R|S(?:\s+Max)?)?)(?:\s+(?:Pro(?:\s+Max)?|Plus|mini))?))/i;
const samsungPattern = /\b((?:Samsung\s+)?Galaxy\s+(?:S(?:[2-9]\d|1\d)(?:\s*(?:FE|\+|Ultra|Edge))?|Note\s*(?:[8-9]|1\d|20)(?:\s+Ultra)?|A(?:0[3-5]|[1-7]\d)(?:\s*5G)?|Z\s*(?:Flip|Fold)\s*[2-9]))/i;
const storagePattern = /\b(\d{1,4})\s*(GB|Go|TB)\b/i;
const accessoryPattern = /\b(?:bo[iî]te|coque|housse|funda|case|chargeur|cargador|c[aâ]ble|cable|adaptateur|[ée]couteurs?|vitre|protection|film|support|dragonne|batterie(?: externe)?|bateria|[ée]cran|screen|pi[èe]ce|component|tampa|alto[-\s]?falante|speaker|placa|flex|bot(?:ã|a)o|bouton|c[aâ]mera|c[âa]mara|motor|hs|hors service|non[-\s]?fonctionnel|pour pi[èe]ces?|for parts|[àa] r[ée]parer|emballage(?:\s+vide)?|paquet(?:\s+vide)?|empty\s+(?:box|package|packaging)|(?:bo[iî]te|package|packaging)\s+(?:vide|empty)|t[ée]l[ée]phone\s+(?:non\s+)?inclus|phone\s+not\s+included)\b/i;
const safetyExclusionPattern = /\b(?:emballage\s+vide|paquet\s+vide|empty\s+(?:box|package|packaging)|(?:bo[iî]te|package|packaging)\s+(?:vide|empty)|t[ée]l[ée]phone\s+(?:non\s+)?inclus|phone\s+not\s+included|pour\s+pi[èe]ces?|for\s+parts|hors\s+service|non[-\s]?fonctionnel|[àa]\s+r[ée]parer)\b/i;

/** Description prose may only veto an otherwise explicit product, never select it. */
export function hasSafetyExclusion(text: string): boolean {
  return safetyExclusionPattern.test(text);
}

function canonicalModel(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\biphone\b/i, 'iPhone').replace(/\bgalaxy\b/i, 'Galaxy').trim();
}

export function parseStorage(text: string): number | undefined {
  const match = text.match(storagePattern);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return match[2].toLowerCase() === 'tb' ? amount * 1024 : amount;
}

export function parseCondition(text: string): string {
  const lowered = text.toLowerCase();
  if (/\b(?:très bon état|excellent|comme neuf|like new|neuf)\b/.test(lowered)) return 'excellent condition';
  if (/\b(?:correct|fair|us[ée]|ab[iî]m[ée]|poor)\b/.test(lowered)) return 'fair condition';
  return 'good condition';
}

/** Extracts only the attributes allowed to influence a valuation. */
export function parseDevice(text: string): Device | undefined {
  if (accessoryPattern.test(text)) return undefined;
  const match = text.match(iphonePattern) ?? text.match(samsungPattern);
  if (!match) return undefined;
  const isIphone = /^iphone/i.test(match[1]);
  return {
    brand: isIphone ? 'iphone' : 'samsung',
    model: canonicalModel(match[1]),
    storage: parseStorage(text),
    condition: parseCondition(text)
  };
}
