import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator'

export class CreatePageAnalyticsDto {
  @IsString()
  event_type: string

  @IsOptional()
  @IsString()
  user_id?: string

  @IsOptional()
  @IsString()
  page_path?: string

  @IsOptional()
  @IsString()
  page_title?: string

  @IsOptional()
  @IsString()
  page_location?: string

  @IsOptional()
  @IsString()
  user_agent?: string

  @IsOptional()
  @IsString()
  button_name?: string

  @IsOptional()
  @IsString()
  button_label?: string

  @IsOptional()
  @IsString()
  form_name?: string

  @IsOptional()
  @IsNumber()
  load_time_ms?: number

  @IsOptional()
  @IsNumber()
  scroll_percent?: number

  @IsOptional()
  @IsObject()
  additional_params?: Record<string, any>

  @IsOptional()
  @IsString()
  session_id?: string

  @IsOptional()
  @IsString()
  country?: string

  @IsOptional()
  @IsString()
  city?: string
}
