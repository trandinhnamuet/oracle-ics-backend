import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRate } from './exchange-rate.entity';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

@Injectable()
export class ExchangeRateService {
  constructor(
    @InjectRepository(ExchangeRate)
    private readonly exchangeRateRepository: Repository<ExchangeRate>,
  ) {}

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
      const today = new Date().toISOString().slice(0, 10);
      // Lưu USD/VND giá mua
      await this.exchangeRateRepository.save({
        currency_from: 'USD',
        currency_to: 'VND',
        date: today,
        rate: buy,
        direction: 'buy',
      });
      // Lưu USD/VND giá bán
      if (sell) {
        await this.exchangeRateRepository.save({
          currency_from: 'USD',
          currency_to: 'VND',
          date: today,
          rate: sell,
          direction: 'sell',
        });
      }
      console.log(`Tỉ giá USD/VND: Mua ${buy}, Bán ${sell}`);
    } catch (error) {
      console.error('Lỗi lấy tỉ giá:', error);
    }
  }
}
