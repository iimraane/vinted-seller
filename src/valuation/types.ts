import type { Device } from '../domain/device';

export interface Quote {
  provider: string;
  amount: number;
  fetchedAt: number;
}

export interface ValuationProvider {
  readonly name: string;
  getQuote(device: Device): Promise<Quote | undefined>;
}

/** A source failure is observability data, never a price or a fallback value. */
export interface ProviderDiagnostic {
  provider: string;
  reason: string;
}

export interface QuoteResult {
  quote?: Quote;
  diagnostics: ProviderDiagnostic[];
}

export interface RemoteOffer {
  model?: string;
  storage?: number;
  condition?: string;
  amount: number;
}
