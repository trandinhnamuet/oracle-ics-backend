import { Type } from 'class-transformer';
import { IsOptional, IsNumber, IsString, IsEnum, IsDateString, IsBoolean, IsDate } from 'class-validator';

// The global ValidationPipe runs with whitelist + forbidNonWhitelisted, so a DTO with
// no class-validator decorators rejects every property ("property adminId should not
// exist") and the endpoint was unusable.
export class CreateAdminLoginHistoryDto {
  @IsOptional() @IsNumber() adminId?: number | null;
  @IsString() username: string;
  @IsString() role: string;
  @Type(() => Date) @IsDate() loginTime: Date;
  @IsEnum(['success', 'failed', 'locked']) loginStatus: 'success' | 'failed' | 'locked';
  @IsOptional() @IsString() ipV4?: string | null;
  @IsOptional() @IsString() ipV6?: string | null;
  @IsOptional() @IsString() country?: string | null;
  @IsOptional() @IsString() city?: string | null;
  @IsOptional() @IsString() isp?: string | null;
  @IsOptional() @IsString() browser?: string | null;
  @IsOptional() @IsString() os?: string | null;
  @IsOptional() @IsEnum(['desktop', 'mobile', 'tablet', 'unknown']) deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown' | null;
  @IsOptional() @IsString() userAgent?: string | null;
  @IsOptional() @IsEnum(['pending', 'passed', 'failed', 'not_enabled']) twoFaStatus?: 'pending' | 'passed' | 'failed' | 'not_enabled';
  @IsOptional() @IsString() sessionId?: string;
  @IsBoolean() isNewDevice: boolean;
  @IsOptional() @IsNumber() failedAttemptsBeforeSuccess?: number;
}

export class AdminLoginHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adminId?: number;

  @IsOptional()
  @IsString()
  @IsEnum(['success', 'failed', 'locked'])
  status?: 'success' | 'failed' | 'locked';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  @IsEnum(['loginTime', 'username', 'status'])
  sortBy?: 'loginTime' | 'username' | 'status';

  @IsOptional()
  @IsString()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}

export class AdminLoginHistoryResponseDto {
  id: number;
  adminId: number;
  username: string;
  role: string;
  loginTime: Date;
  loginStatus: 'success' | 'failed' | 'locked';
  ipV4?: string;
  ipV6?: string;
  country?: string;
  city?: string;
  isp?: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  twoFaStatus?: string;
  sessionId?: string;
  isNewDevice: boolean;
  logoutTime?: Date;
  sessionDurationMinutes?: number;
  failedAttemptsBeforeSuccess: number;
  createdAt: Date;
}

export class AdminLoginStatisticsDto {
  totalLogins: number;
  successfulLogins: number;
  failedLogins: number;
  lockedAttempts: number;
  successRate: number;
  lastLoginTime?: string | null;
  lastLoginIp?: string;
  uniqueDevices: number;
  uniqueCountries: number;
  activeSessions: number;
}
