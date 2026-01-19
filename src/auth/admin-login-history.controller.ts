import { Controller, Get, Post, Body, Param, Query, UseGuards, Logger, UseFilters } from '@nestjs/common';
import { AdminLoginHistoryService } from './admin-login-history.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  CreateAdminLoginHistoryDto,
  AdminLoginHistoryQueryDto,
  AdminLoginHistoryResponseDto,
  AdminLoginStatisticsDto,
} from './dto/admin-login-history.dto';

@Controller('auth/admin-login-history')
export class AdminLoginHistoryController {
  private readonly logger = new Logger(AdminLoginHistoryController.name);

  constructor(private readonly adminLoginHistoryService: AdminLoginHistoryService) {}

  /**
   * Record a new login
   */
  @Post('record')
  async recordLogin(@Body() createDto: CreateAdminLoginHistoryDto) {
    this.logger.log(`Recording login for admin ${createDto.adminId}`);
    return await this.adminLoginHistoryService.recordLogin(createDto);
  }

  /**
   * Get all login history (admin only)
   */
  @Get('all')
  @UseGuards(JwtAuthGuard)
  async getLoginHistory(@Query() query: AdminLoginHistoryQueryDto) {
    this.logger.log(`Fetching login history with filters: ${JSON.stringify(query)}`);
    return await this.adminLoginHistoryService.getLoginHistory(query);
  }

  /**
   * Get login history for specific admin (admin only)
   */
  @Get('admin/:adminId')
  @UseGuards(JwtAuthGuard)
  async getAdminLoginHistory(
    @Param('adminId') adminId: number,
    @Query() query: AdminLoginHistoryQueryDto,
  ) {
    this.logger.log(`Fetching login history for admin ${adminId}`);
    return await this.adminLoginHistoryService.getAdminLoginHistory(adminId, query);
  }

  /**
   * Get single login record
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getLoginById(@Param('id') id: number) {
    this.logger.log(`Fetching login record ${id}`);
    return await this.adminLoginHistoryService.getLoginById(id);
  }

  /**
   * Get recent logins for admin
   */
  @Get('admin/:adminId/recent')
  @UseGuards(JwtAuthGuard)
  async getRecentLogins(@Param('adminId') adminId: number, @Query('days') days: number = 30) {
    this.logger.log(`Fetching recent logins for admin ${adminId} (last ${days} days)`);
    return await this.adminLoginHistoryService.getRecentLogins(adminId, days);
  }

  /**
   * Get login statistics for admin
   */
  @Get('admin/:adminId/statistics')
  @UseGuards(JwtAuthGuard)
  async getLoginStatistics(
    @Param('adminId') adminId: number,
    @Query('days') days: number = 30,
  ): Promise<AdminLoginStatisticsDto> {
    this.logger.log(`Fetching login statistics for admin ${adminId}`);
    return await this.adminLoginHistoryService.getLoginStatistics(adminId, days);
  }

  /**
   * Get suspicious login attempts
   */
  @Get('admin/:adminId/suspicious')
  @UseGuards(JwtAuthGuard)
  async getSuspiciousAttempts(@Param('adminId') adminId: number) {
    this.logger.log(`Fetching suspicious attempts for admin ${adminId}`);
    return await this.adminLoginHistoryService.getSuspiciousAttempts(adminId);
  }

  /**
   * Record logout
   */
  @Post(':sessionId/logout')
  async recordLogout(@Param('sessionId') sessionId: string, @Body() body: { logoutTime: string }) {
    this.logger.log(`Recording logout for session ${sessionId}`);
    await this.adminLoginHistoryService.recordLogout(sessionId, new Date(body.logoutTime));
    return { success: true };
  }
}
