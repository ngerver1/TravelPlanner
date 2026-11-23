// Exchange rates from Frankfurter (European Central Bank reference rates). Free, no key, no personal data sent.
import type { Rates } from '../domain/types';

export async function fetchRates(base: string): Promise<Rates> {
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 404 ? `No rates for ${base}` : `Rates service error ${res.status}`);
  const body = await res.json() as { base: string; date: string; rates: Record<string, number> };
  return { base: body.base, date: body.date, rates: body.rates };
}
