import { GeolocationUtil } from './geolocation.util';

/**
 * Offline-only: `fetch` is always mocked, so the suite never touches the network
 * (and never leaks a client IP to a third party from CI).
 */
describe('GeolocationUtil.getLocationFromIP', () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.GEOIP_LOOKUP_URL;
  const originalTimeout = process.env.GEOIP_LOOKUP_TIMEOUT_MS;

  let fetchMock: jest.Mock;

  const jsonOk = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

  beforeEach(() => {
    GeolocationUtil.clearCache();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    delete process.env.GEOIP_LOOKUP_URL; // exercise the built-in default
    delete process.env.GEOIP_LOOKUP_TIMEOUT_MS;
    jest.spyOn(GeolocationUtil['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env.GEOIP_LOOKUP_URL = originalUrl;
    process.env.GEOIP_LOOKUP_TIMEOUT_MS = originalTimeout;
    jest.restoreAllMocks();
  });

  const EMPTY = { country: null, city: null, timezone: null };

  it('labels loopback without calling the provider', async () => {
    for (const ip of ['127.0.0.1', '::1', 'localhost']) {
      await expect(GeolocationUtil.getLocationFromIP(ip)).resolves.toEqual({
        country: 'Local',
        city: 'Localhost',
        timezone: null,
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns empty for missing input', async () => {
    await expect(GeolocationUtil.getLocationFromIP(null)).resolves.toEqual(EMPTY);
    await expect(GeolocationUtil.getLocationFromIP('')).resolves.toEqual(EMPTY);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    '10.0.0.5',
    '172.16.4.1',
    '192.168.1.7',
    '169.254.10.1',
    '100.64.3.2', // CGNAT
    '0.0.0.0',
    '224.0.0.1', // multicast
    '::ffff:192.168.1.7', // IPv4-mapped private
    'fd00::1', // unique-local
    'fe80::1', // link-local
  ])('skips the provider for private/reserved %s', async (ip) => {
    await expect(GeolocationUtil.getLocationFromIP(ip)).resolves.toEqual(EMPTY);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The address originates from proxy headers, so a forged X-Forwarded-For must
  // never be able to steer the outbound request.
  it.each([
    'evil.com/x',
    '1.1.1.1 ; rm -rf /',
    '8.8.8.8/../../admin',
    'http://169.254.169.254/latest/meta-data',
    '999.1.1.1',
    '1.2.3',
  ])('rejects non-literal address %s without any request', async (ip) => {
    await expect(GeolocationUtil.getLocationFromIP(ip)).resolves.toEqual(EMPTY);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is fully disabled by an empty GEOIP_LOOKUP_URL', async () => {
    process.env.GEOIP_LOOKUP_URL = '';
    await expect(GeolocationUtil.getLocationFromIP('8.8.8.8')).resolves.toEqual(EMPTY);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('substitutes {ip} into the configured URL', async () => {
    process.env.GEOIP_LOOKUP_URL = 'https://geo.example/api?addr={ip}';
    fetchMock.mockResolvedValue(jsonOk({ country_code: 'VN', city: 'Hanoi' }));

    await GeolocationUtil.getLocationFromIP('203.0.113.9');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://geo.example/api?addr=203.0.113.9');
  });

  it('appends the address when the URL has no {ip} placeholder', async () => {
    process.env.GEOIP_LOOKUP_URL = 'https://geo.example/lookup/';
    fetchMock.mockResolvedValue(jsonOk({ country_code: 'VN' }));

    await GeolocationUtil.getLocationFromIP('203.0.113.9');

    expect(fetchMock.mock.calls[0][0]).toBe('https://geo.example/lookup/203.0.113.9');
  });

  it('parses the ipwho.is shape (nested timezone)', async () => {
    fetchMock.mockResolvedValue(
      jsonOk({
        success: true,
        country: 'Vietnam',
        country_code: 'vn',
        city: 'Hanoi',
        timezone: { id: 'Asia/Ho_Chi_Minh' },
      }),
    );

    await expect(GeolocationUtil.getLocationFromIP('203.0.113.9')).resolves.toEqual({
      country: 'VN',
      city: 'Hanoi',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('parses the ip-api.com shape (flat timezone)', async () => {
    fetchMock.mockResolvedValue(
      jsonOk({
        status: 'success',
        countryCode: 'TW',
        city: 'Taipei',
        timezone: 'Asia/Taipei',
      }),
    );

    await expect(GeolocationUtil.getLocationFromIP('203.0.113.10')).resolves.toEqual({
      country: 'TW',
      city: 'Taipei',
      timezone: 'Asia/Taipei',
    });
  });

  it.each([
    ['provider-level failure flag', { success: false, message: 'reserved range' }],
    ['ip-api fail status', { status: 'fail', message: 'private range' }],
    ['error payload', { error: { code: 104, info: 'quota reached' } }],
    ['non-object body', 'nope'],
  ])('returns empty on %s', async (_label, body) => {
    fetchMock.mockResolvedValue(jsonOk(body));
    await expect(GeolocationUtil.getLocationFromIP('203.0.113.11')).resolves.toEqual(EMPTY);
  });

  it('fails soft on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as unknown as Response);
    await expect(GeolocationUtil.getLocationFromIP('203.0.113.12')).resolves.toEqual(EMPTY);
  });

  it('fails soft on a network error / timeout', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
    await expect(GeolocationUtil.getLocationFromIP('203.0.113.13')).resolves.toEqual(EMPTY);
  });

  it('caches a hit so repeat logins from one IP cost no request', async () => {
    fetchMock.mockResolvedValue(jsonOk({ country_code: 'VN', city: 'Hanoi' }));

    const first = await GeolocationUtil.getLocationFromIP('203.0.113.14');
    const second = await GeolocationUtil.getLocationFromIP('203.0.113.14');

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('hands back a copy, so a caller cannot poison the cache', async () => {
    fetchMock.mockResolvedValue(jsonOk({ country_code: 'VN', city: 'Hanoi' }));

    const first = await GeolocationUtil.getLocationFromIP('203.0.113.15');
    first.city = 'MUTATED';

    await expect(GeolocationUtil.getLocationFromIP('203.0.113.15')).resolves.toEqual({
      country: 'VN',
      city: 'Hanoi',
      timezone: null,
    });
  });

  it('clamps to the varchar(100) columns and drops blank values', async () => {
    fetchMock.mockResolvedValue(jsonOk({ country_code: 'VN', city: 'x'.repeat(250), timezone: '   ' }));

    const result = await GeolocationUtil.getLocationFromIP('203.0.113.16');

    expect(result.city).toHaveLength(100);
    expect(result.timezone).toBeNull();
  });
});
