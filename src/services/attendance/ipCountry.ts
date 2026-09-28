/**
 * The country of a network address, for the VPN column on the owner's check-in
 * locations page.
 *
 * Needed only when the database recorded an address but no country: whether
 * Supabase passes Cloudflare's country header through to Postgres is not
 * guaranteed, and without a country no VPN could ever be spotted.
 *
 * Looked up from the owner's browser with free, key-less services — GeoJS,
 * then country.is if that fails — once per address per page load. Only the
 * bare address is sent, never a name.
 */

const SOURCES: ((ip: string) => string)[] = [
  (ip) => `https://get.geojs.io/v1/ip/country/${ip}.json`,
  (ip) => `https://api.country.is/${ip}`,
];

/** Shared by every caller, so the page's live refresh never repeats a lookup. */
const cache = new Map<string, Promise<string | null>>();

async function lookup(ip: string): Promise<string | null> {
  for (const source of SOURCES) {
    try {
      const response = await fetch(source(ip), {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;
      const { country } = (await response.json()) as { country?: unknown };
      if (typeof country === 'string' && /^[A-Za-z]{2}$/.test(country)) {
        return country.toUpperCase();
      }
    } catch {
      // Unreachable or malformed — try the next source.
    }
  }
  return null;
}

/** Two-letter country of `ip`, or null when it cannot be told. */
export function lookupIpCountry(ip: string): Promise<string | null> {
  // Only a bare IPv4 / IPv6 address ever goes into a URL.
  if (!/^[0-9a-fA-F:.]+$/.test(ip)) return Promise.resolve(null);
  let pending = cache.get(ip);
  if (!pending) {
    pending = lookup(ip);
    cache.set(ip, pending);
  }
  return pending;
}
