import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TermsArticleDto {
  @IsString()
  @IsNotEmpty()
  number: string;

  @IsString()
  @IsNotEmpty()
  heading: string;

  @IsArray()
  @IsString({ each: true })
  paragraphs: string[];
}

export class CreateTermsSectionDto {
  @IsString()
  @IsNotEmpty()
  titleVi: string;

  @IsString()
  @IsNotEmpty()
  titleEn: string;

  @IsInt()
  @Min(0)
  orderIndex: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermsArticleDto)
  articlesVi: TermsArticleDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermsArticleDto)
  articlesEn: TermsArticleDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTermsSectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  titleVi?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  titleEn?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermsArticleDto)
  articlesVi?: TermsArticleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermsArticleDto)
  articlesEn?: TermsArticleDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
