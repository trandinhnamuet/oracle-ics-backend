import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRate } from './exchange-rate.entity';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    @InjectRepository(ExchangeRate)
    private readonly exchangeRateRepository: Repository<ExchangeRate>,
  ) {}

  // Rates are keyed by calendar day in Vietnam: the cron runs at 01:00 Asia/Ho_Chi_Minh
  // and the site is read during Vietnamese business hours. Keying by the UTC date left
  // /exchange-rate/today empty from 07:00 to 01:00 VN every day.
  static todayKey(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }

  private async upsertRate(from: string, to: string, date: string, direction: string, rate: number) {
    const existing = await this.exchangeRateRepository.findOne({
      where: { currency_from: from, currency_to: to, date, direction },
    });
    if (existing) {
      existing.rate = rate;
      await this.exchangeRateRepository.save(existing);
    } else {
      await this.exchangeRateRepository.save({ currency_from: from, currency_to: to, date, direction, rate });
    }
  }

  /**
   * Today's rates (Vietnam calendar day). If today's fetch has not run yet, fall back to
   * the most recent day on record rather than returning an empty list.
   */
  async getTodayRates(filters: { currency_from?: string; currency_to?: string; direction?: string }): Promise<ExchangeRate[]> {
    const where: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) if (v) where[k] = v;
    const rows = await this.exchangeRateRepository.find({ where: { ...where, date: ExchangeRateService.todayKey() } });
    if (rows.length) return rows;
    const latest = await this.exchangeRateRepository.findOne({ where, order: { date: 'DESC' } });
    if (!latest) return [];
    return this.exchangeRateRepository.find({ where: { ...where, date: latest.date } });
  }

  // Hàm lấy tỉ giá từ Vietcombank và lưu vào DB
  async fetchAndSaveRates() {
    try {
      const url = 'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx';
      const response = await axios.get(url, { responseType: 'text' });
      const xml = response.data;
      const result = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true });
      // Tìm Exrate có CurrencyCode = USD
      const exrates = result.ExrateList.Exrate;
      let usdRate;
      if (Array.isArray(exrates)) {
        usdRate = exrates.find((r: any) => r.CurrencyCode === 'USD');
      } else {
        usdRate = exrates.CurrencyCode === 'USD' ? exrates : null;
      }
      if (!usdRate) throw new Error('Không tìm thấy tỉ giá USD');
      // Lấy giá mua và bán, loại bỏ dấu phẩy
      const buy = parseFloat(usdRate.Buy.replace(/,/g, ''));
      const sell = parseFloat(usdRate.Sell.replace(/,/g, ''));
      const today = ExchangeRateService.todayKey();
      // Lưu USD/VND giá mua
      await this.upsertRate('USD', 'VND', today, 'buy', buy);
      // Lưu USD/VND giá bán
      if (sell) {
        await this.upsertRate('USD', 'VND', today, 'sell', sell);
      }
      this.logger.log(`USD/VND rates updated: buy=${buy}, sell=${sell}`);
    } catch (error) {
      this.logger.error('Failed to fetch exchange rates', error?.stack || error?.message || error);
    }
  }
}
