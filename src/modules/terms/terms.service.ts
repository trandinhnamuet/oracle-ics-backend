import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TermsSection } from '../../entities/terms-section.entity';
import { CreateTermsSectionDto, UpdateTermsSectionDto } from './dto/terms-section.dto';
import { DEFAULT_TERMS_SECTIONS } from './defaults/default-terms.data';

type PublicTermsSection = {
  id: number;
  title: string;
  orderIndex: number;
  articles: {
    number: string;
    heading: string;
    paragraphs: string[];
  }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class TermsService {
  private readonly translationCache = new Map<string, string>();

  constructor(
    @InjectRepository(TermsSection)
    private readonly termsSectionRepo: Repository<TermsSection>,
  ) {}

  private async ensureSeedData(): Promise<void> {
    const count = await this.termsSectionRepo.count();
    if (count > 0) return;

    const seedRows = DEFAULT_TERMS_SECTIONS.map((section, idx) =>
      this.termsSectionRepo.create({
        titleVi: section.titleVi,
        titleEn: section.titleEn,
        orderIndex: idx,
        isActive: true,
        articlesVi: section.articlesVi,
        articlesEn: section.articlesEn,
      }),
    );

    await this.termsSectionRepo.save(seedRows);
  }

  private cloneArticles(
    articles: { number: string; heading: string; paragraphs: string[] }[] | undefined,
  ): { number: string; heading: string; paragraphs: string[] }[] {
    return (articles || []).map((article) => ({
      number: article.number,
      heading: article.heading,
      paragraphs: [...article.paragraphs],
    }));
  }

  private normalizeText(value?: string): string {
    return (value || '').trim().toLowerCase();
  }

  private areArticlesEquivalent(
    left: { number: string; heading: string; paragraphs: string[] }[] | undefined,
    right: { number: string; heading: string; paragraphs: string[] }[] | undefined,
  ): boolean {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;

    for (let i = 0; i < left.length; i += 1) {
      const a = left[i];
      const b = right[i];

      if (this.normalizeText(a.number) !== this.normalizeText(b.number)) return false;
      if (this.normalizeText(a.heading) !== this.normalizeText(b.heading)) return false;
      if ((a.paragraphs || []).length !== (b.paragraphs || []).length) return false;

      for (let j = 0; j < (a.paragraphs || []).length; j += 1) {
        if (this.normalizeText(a.paragraphs[j]) !== this.normalizeText(b.paragraphs[j])) {
          return false;
        }
      }
    }

    return true;
  }

  private async translateViToEn(text: string): Promise<string> {
    const source = (text || '').trim();
    if (!source) return source;

    const cached = this.translationCache.get(source);
    if (cached) return cached;

    try {
      const url =
        'https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=en&dt=t&q=' +
        encodeURIComponent(source);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        this.translationCache.set(source, source);
        return source;
      }

      const payload = await response.json();
      const translated = Array.isArray(payload?.[0])
        ? payload[0].map((part: any) => (Array.isArray(part) ? part[0] : '')).join('')
        : source;

      const result = translated?.trim() || source;
      this.translationCache.set(source, result);
      return result;
    } catch {
      this.translationCache.set(source, source);
      return source;
    }
  }

  /**
   * Repair partially-migrated rows so VI/EN data are independent but never empty.
   * Priority: existing value -> opposite language -> default seed by order index.
   */
  private async ensureBilingualContentIntegrity(enableAutoTranslateToEnglish = false): Promise<void> {
    const sections = await this.termsSectionRepo.find({ order: { orderIndex: 'ASC', id: 'ASC' } });
    if (!sections.length) return;

    const defaultsByOrder = new Map(DEFAULT_TERMS_SECTIONS.map((item, idx) => [idx, item]));
    const rowsToUpdate: TermsSection[] = [];

    for (const section of sections) {
      const fallback = defaultsByOrder.get(section.orderIndex);
      let changed = false;

      if (!section.titleVi?.trim()) {
        section.titleVi = section.titleEn?.trim() || fallback?.titleVi || '';
        changed = true;
      }

      if (!section.titleEn?.trim()) {
        section.titleEn = section.titleVi?.trim() || fallback?.titleEn || section.titleVi || '';
        changed = true;
      }

      if (!Array.isArray(section.articlesVi) || section.articlesVi.length === 0) {
        section.articlesVi = this.cloneArticles(
          (Array.isArray(section.articlesEn) && section.articlesEn.length > 0
            ? section.articlesEn
            : fallback?.articlesVi) || [],
        );
        changed = true;
      }

      if (!Array.isArray(section.articlesEn) || section.articlesEn.length === 0) {
        section.articlesEn = this.cloneArticles(
          (Array.isArray(section.articlesVi) && section.articlesVi.length > 0
            ? section.articlesVi
            : fallback?.articlesEn) || [],
        );
        changed = true;
      }

      const shouldTranslateEnglish =
        enableAutoTranslateToEnglish &&
        !!section.titleVi?.trim() &&
        !!section.articlesVi?.length &&
        this.normalizeText(section.titleEn) === this.normalizeText(section.titleVi) &&
        this.areArticlesEquivalent(section.articlesEn, section.articlesVi);

      if (shouldTranslateEnglish) {
        section.titleEn = await this.translateViToEn(section.titleVi);

        const translatedArticles: {
          number: string;
          heading: string;
          paragraphs: string[];
        }[] = [];

        for (const article of section.articlesVi) {
          const translatedHeading = await this.translateViToEn(article.heading);
          const translatedParagraphs: string[] = [];

          for (const paragraph of article.paragraphs || []) {
            translatedParagraphs.push(await this.translateViToEn(paragraph));
          }

          translatedArticles.push({
            number: article.number,
            heading: translatedHeading,
            paragraphs: translatedParagraphs,
          });
        }

        section.articlesEn = translatedArticles;
        changed = true;
      }

      if (changed) rowsToUpdate.push(section);
    }

    if (rowsToUpdate.length > 0) {
      await this.termsSectionRepo.save(rowsToUpdate);
    }
  }

  async getPublicSections(language: string): Promise<PublicTermsSection[]> {
    await this.ensureSeedData();
    const useVietnamese = language?.toLowerCase().startsWith('vi');
    await this.ensureBilingualContentIntegrity(!useVietnamese);
    const sections = await this.termsSectionRepo.find({
      where: { isActive: true },
      order: { orderIndex: 'ASC', id: 'ASC' },
    });

    return sections.map((section) => ({
      id: section.id,
      title: useVietnamese ? section.titleVi : section.titleEn,
      orderIndex: section.orderIndex,
      articles: useVietnamese ? section.articlesVi : section.articlesEn,
      isActive: section.isActive,
      createdAt: section.createdAt,
      updatedAt: section.updatedAt,
    }));
  }

  async getAllSections(): Promise<TermsSection[]> {
    await this.ensureSeedData();
    await this.ensureBilingualContentIntegrity(false);
    return this.termsSectionRepo.find({ order: { orderIndex: 'ASC', id: 'ASC' } });
  }

  async createSection(dto: CreateTermsSectionDto, updatedBy?: number): Promise<TermsSection> {
    const entity = this.termsSectionRepo.create({
      titleVi: dto.titleVi,
      titleEn: dto.titleEn,
      orderIndex: dto.orderIndex,
      articlesVi: dto.articlesVi,
      articlesEn: dto.articlesEn,
      isActive: dto.isActive ?? true,
      updatedBy,
    });
    return this.termsSectionRepo.save(entity);
  }

  async updateSection(id: number, dto: UpdateTermsSectionDto, updatedBy?: number): Promise<TermsSection> {
    await this.termsSectionRepo.update(id, {
      ...dto,
      ...(updatedBy ? { updatedBy } : {}),
    });

    return this.termsSectionRepo.findOneByOrFail({ id });
  }

  async deleteSection(id: number): Promise<void> {
    await this.termsSectionRepo.delete(id);
  }
}
