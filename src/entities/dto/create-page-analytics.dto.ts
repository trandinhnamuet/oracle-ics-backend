import { IsString, IsOptional, IsNumber, IsObject, MaxLength } from 'class-validator'

export class CreatePageAnalyticsDto {
  @IsString()
  @MaxLength(512)
  event_type: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  user_id?: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  page_path?: string

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  page_title?: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  page_location?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  user_agent?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  button_name?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  button_label?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  form_name?: string

  @IsOptional()
  @IsNumber()
  load_time_ms?: number

  @IsOptional()
  @IsNumber()
  scroll_percent?: number

  // NOTE: additional_params is an unbounded object — no size/depth constraint is
  // applied here to avoid breaking existing clients. Consider capping payload
  // size at the transport/body-parser layer if abuse becomes a concern.
  @IsOptional()
  @IsObject()
  additional_params?: Record<string, any>

  @IsOptional()
  @IsString()
  @MaxLength(512)
  session_id?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  country?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  city?: string
}
