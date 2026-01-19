import { Type } from 'class-transformer';
import { IsOptional, IsNumber, IsString, IsEnum, IsDateString } from 'class-validator';

export class CreateAdminLoginHistoryDto {
  adminId?: number | null;
  username: string;
  role: string;
  loginTime: Date;
  loginStatus: 'success' | 'failed' | 'locked';
  ipV4?: string | null;
  ipV6?: string | null;
  country?: string | null;
  city?: string | null;
  isp?: string | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown' | null;
  userAgent?: string | null;
  twoFaStatus?: 'pending' | 'passed' | 'failed' | 'not_enabled';
  sessionId?: string;
  isNewDevice: boolean;
  failedAttemptsBeforeSuccess?: number;
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
  lastLoginTime?: Date;
  lastLoginIp?: string;
  uniqueDevices: number;
  uniqueCountries: number;
  activeSessions: number;
}
