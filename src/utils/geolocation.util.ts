import { Logger } from '@nestjs/common';
import * as geoip from 'geoip-lite';

export interface GeoLocation {
  country: string | null;
  city: string | null;
  timezone: string | null;
}

export class GeolocationUtil {
  private static readonly logger = new Logger(GeolocationUtil.name);

  /**
   * Get geolocation info from IP address
   */
  static getLocationFromIP(ip: string | null): GeoLocation {
    const defaultLocation: GeoLocation = {
      country: null,
      city: null,
      timezone: null,
    };

    if (!ip) {
      return defaultLocation;
    }

    try {
      // Skip localhost/private IPs
      if (ip === '127.0.0.1' || ip === 'localhost' || ip === '::1') {
        return {
          country: 'Local',
          city: 'Localhost',
          timezone: null,
        };
      }

      // Check if IP is private
      if (this.isPrivateIP(ip)) {
        return defaultLocation;
      }

      // Look up geolocation using geoip-lite (offline GeoLite2 database)
      const geo = geoip.lookup(ip);
      if (geo) {
        return {
          country: geo.country || null,
          city: geo.city || null,
          timezone: geo.timezone || null,
        };
      }

      return defaultLocation;
    } catch (error) {
      this.logger.warn(`Failed to lookup geolocation for IP ${ip}:`, error);
      return defaultLocation;
    }
  }

  /**
   * Get geolocation from browser-provided coordinates via Nominatim reverse geocoding.
   * Returns city/country names; falls back to formatted coordinates string if API fails.
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

      return { country, city, timezone };
    } catch (error) {
      this.logger.warn(`Failed to reverse geocode (${latitude}, ${longitude}):`, error);
      // Fallback: store formatted coordinates so location is not lost
      return {
        country: null,
        city: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        timezone: null,
      };
    }
  }

  /**
   * Check if IP is private
   */
  private static isPrivateIP(ip: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^fc00:/i,
      /^fe80:/i,
    ];

    return privateRanges.some((range) => range.test(ip));
  }
}
