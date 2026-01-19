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
