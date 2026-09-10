import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * Payload beacon từ trình duyệt khách. Mọi trường đều do client gửi nên đều bị
 * cắt ngắn theo đúng độ dài cột — IP thì KHÔNG nhận từ đây mà lấy từ
 * request.ip ở phía server (xem VisitLogController).
 */
export class TrackVisitDto {
  @IsString()
  @MaxLength(64)
  visitor_id: string

  @IsString()
  @MaxLength(64)
  session_id: string

  @IsOptional()
  @IsBoolean()
  is_new_visitor?: boolean

  @IsString()
  @MaxLength(512)
  path: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  referrer?: string

  @IsOptional()
  @IsString()
  @MaxLength(16)
  screen?: string

  @IsOptional()
  @IsString()
  @MaxLength(16)
  lang?: string
}
