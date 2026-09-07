import { Logger } from '@nestjs/common';

export interface GeoLocation {
  country: string | null;
  city: string | null;
  timezone: string | null;
}

interface CacheEntry {
  value: GeoLocation;
  expiresAt: number;
}

/**
 * IP → location.
 *
 * This used to be backed by `geoip-lite`, which bundles a copy of the GeoLite2
 * database (154 MB of .dat files) and reads ALL of it into the heap at
 * `require()` time — ~142 MB resident, 24/7, on every worker. The only consumer
 * is admin login-history enrichment (a handful of rows per month, and only when
 * the browser refused to share coordinates), so that trade was heavily negative
 * on a 1 GB-free box. The lookup is now an on-demand HTTPS call with a short
 * timeout and a small in-process cache: 0 MB idle, and the same output shape.
 *
 * Fails soft by design — geo enrichment must never break or slow down a login
 * beyond the timeout.
 */
export class GeolocationUtil {
  private static readonly logger = new Logger(GeolocationUtil.name);

  /** `{ip}` is substituted with the (validated, encoded) address. Empty value disables lookups. */
  private static readonly DEFAULT_LOOKUP_URL = 'https://ipwho.is/{ip}';
  private static readonly DEFAULT_TIMEOUT_MS = 2000;
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  private static readonly CACHE_MAX_ENTRIES = 500;
  /** admin_login_history.country / .city are varchar(100). */
  private static readonly MAX_FIELD_LENGTH = 100;

  private static readonly cache = new Map<string, CacheEntry>();

  private static readonly EMPTY: GeoLocation = { country: null, city: null, timezone: null };

  /**
   * Get geolocation info from an IP address.
   *
   * Now async (was a synchronous in-memory lookup) — callers must await it.
   */
  static async getLocationFromIP(ip: string | null): Promise<GeoLocation> {
    if (!ip) {
      return { ...this.EMPTY };
    }

    const address = ip.trim();

    // Skip localhost — keep the historical labels so existing rows stay comparable.
    if (address === '127.0.0.1' || address === 'localhost' || address === '::1') {
      return { country: 'Local', city: 'Localhost', timezone: null };
    }

    // SECURITY: `ip` ultimately derives from proxy headers, so it is only as
    // trustworthy as the fronting proxy. Reject anything that is not a literal
    // IP before it is interpolated into the provider URL — a forged
    // X-Forwarded-For must never be able to steer the outbound request.
    if (!this.isValidIp(address)) {
      this.logger.warn(`Skipping geolocation lookup for malformed IP: ${JSON.stringify(address)}`);
      return { ...this.EMPTY };
    }

    // Private / reserved space has no public geolocation.
    if (this.isPrivateIP(address)) {
      return { ...this.EMPTY };
    }

    const cached = this.readCache(address);
    if (cached) {
      return cached;
    }

    const lookupUrl = (process.env.GEOIP_LOOKUP_URL ?? this.DEFAULT_LOOKUP_URL).trim();
    if (!lookupUrl) {
      // Explicitly disabled (GEOIP_LOOKUP_URL=''): browser coordinates only.
      return { ...this.EMPTY };
    }

    try {
      const location = await this.lookupViaProvider(lookupUrl, address);
      this.writeCache(address, location);
      return location;
    } catch (error) {
      this.logger.warn(`Failed to lookup geolocation for IP ${address}: ${this.describe(error)}`);
      return { ...this.EMPTY };
    }
  }

  /**
   * Get geolocation from browser-provided coordinates via Nominatim reverse geocoding.
   * Returns city/country names; falls back to formatted coordinates string if API fails.
   *
   * This is the preferred path (see AuthService.login) — it is more accurate than any
   * IP lookup and does not depend on the client IP surviving the proxy chain.
   */
  static async getLocationFromCoordinates(latitude: number, longitude: number): Promise<GeoLocation> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'OracleICS-LoginHistory/1.0',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Nominatim returned ${response.status}`);
      }

      const data: any = await response.json();
      const address = data?.address || {};

      const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        null;

      const country = address.country_code?.toUpperCase() || null;
      const timezone = null; // Nominatim does not return timezone

      return {
        country: this.clamp(country),
        city: this.clamp(city),
        timezone,
      };
    } catch (error) {
      this.logger.warn(`Failed to reverse geocode (${latitude}, ${longitude}): ${this.describe(error)}`);
      // Fallback: store formatted coordinates so location is not lost
      return {
        country: null,
        city: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        timezone: null,
      };
    }
  }

  /** Test seam / ops hook: drop the memoised lookups. */
  static clearCache(): void {
    this.cache.clear();
  }

  private static async lookupViaProvider(lookupUrl: string, ip: string): Promise<GeoLocation> {
    const url = lookupUrl.includes('{ip}')
      ? lookupUrl.replace('{ip}', encodeURIComponent(ip))
      : `${lookupUrl.replace(/\/+$/, '')}/${encodeURIComponent(ip)}`;

    const timeoutMs = this.readPositiveInt(process.env.GEOIP_LOOKUP_TIMEOUT_MS, this.DEFAULT_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'OracleICS-LoginHistory/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Geo provider returned ${response.status}`);
    }

    return this.parseProviderResponse(await response.json());
  }

  /**
   * Tolerant parsing of the common free-provider shapes (ipwho.is, ip-api.com,
   * ipapi.co, freeipapi) so GEOIP_LOOKUP_URL can be repointed without a code change.
   */
  private static parseProviderResponse(data: any): GeoLocation {
    if (!data || typeof data !== 'object') {
      return { ...this.EMPTY };
    }

    // Provider-level "not found" / rate-limited responses still come back as 200.
    if (data.success === false || data.status === 'fail' || data.error) {
      return { ...this.EMPTY };
    }

    const rawCountry =
      data.country_code ?? data.countryCode ?? data.countryCodeIso ?? (typeof data.country === 'string' && data.country.length === 2 ? data.country : null);

    const rawTimezone =
      typeof data.timezone === 'string'
        ? data.timezone
        : data.timezone?.id ?? data.time_zone?.id ?? data.timeZone ?? null;

    return {
      country: this.clamp(typeof rawCountry === 'string' ? rawCountry.toUpperCase() : null),
      city: this.clamp(typeof data.city === 'string' ? data.city : null),
      timezone: this.clamp(typeof rawTimezone === 'string' ? rawTimezone : null),
    };
  }

  private static readCache(ip: string): GeoLocation | null {
    const entry = this.cache.get(ip);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(ip);
      return null;
    }
    return { ...entry.value };
  }

  private static writeCache(ip: string, value: GeoLocation): void {
    if (this.cache.size >= this.CACHE_MAX_ENTRIES) {
      // Map preserves insertion order — evict the oldest entry.
      const oldest = this.cache.keys().next();
      if (!oldest.done) {
        this.cache.delete(oldest.value);
      }
    }
    this.cache.set(ip, { value: { ...value }, expiresAt: Date.now() + this.CACHE_TTL_MS });
  }

  private static clamp(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, this.MAX_FIELD_LENGTH) : null;
  }

  private static readPositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private static describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** Strict literal-IP check (IPv4 dotted quad, or IPv6 incl. IPv4-mapped). */
  private static isValidIp(ip: string): boolean {
    const ipv4 =
      /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
    if (ipv4.test(ip)) {
      return true;
    }

    // IPv6: hex groups and '::' only. Allows a trailing IPv4 form (::ffff:1.2.3.4).
    if (!/^[0-9a-f:.]+$/i.test(ip) || !ip.includes(':') || (ip.match(/::/g) || []).length > 1) {
      return false;
    }
    const tail = ip.slice(ip.lastIndexOf(':') + 1);
    if (tail.includes('.')) {
      return ipv4.test(tail);
    }
    return ip.split(':').every((group) => group === '' || /^[0-9a-f]{1,4}$/i.test(group));
  }

  /**
   * Check if IP is private / reserved (no public geolocation exists for it).
   */
  private static isPrivateIP(ip: string): boolean {
    const privateRanges = [
      /^0\./,
      /^10\./,
      /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // CGNAT 100.64.0.0/10
      /^127\./,
      /^169\.254\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^(22[4-9]|23[0-9])\./, // multicast
      /^24[0-9]\./,
      /^25[0-5]\./,
      /^::$/,
      /^::1$/,
      /^f[cd]/i, // unique-local fc00::/7
      /^fe80:/i,
    ];

    if (privateRanges.some((range) => range.test(ip))) {
      return true;
    }

    // IPv4-mapped IPv6 (::ffff:10.0.0.1) — re-test the embedded address.
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
    return mapped ? this.isPrivateIP(mapped[1]) : false;
  }
}
