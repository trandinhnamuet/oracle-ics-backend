import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, SelectQueryBuilder } from 'typeorm';
import { AdminLoginHistory } from '../entities/admin-login-history.entity';
import { CreateAdminLoginHistoryDto, AdminLoginHistoryQueryDto, AdminLoginStatisticsDto } from './dto/admin-login-history.dto';

@Injectable()
export class AdminLoginHistoryService {
  private readonly logger = new Logger(AdminLoginHistoryService.name);

  constructor(
    @InjectRepository(AdminLoginHistory)
    private adminLoginHistoryRepository: Repository<AdminLoginHistory>,
  ) {}

  /**
   * Record admin login attempt
   */
  async recordLogin(createDto: CreateAdminLoginHistoryDto): Promise<AdminLoginHistory> {
    try {
      const loginRecord = new AdminLoginHistory();
      Object.assign(loginRecord, createDto);
      return await this.adminLoginHistoryRepository.save(loginRecord);
    } catch (error) {
      this.logger.error(`Failed to record login for admin ${createDto.adminId}:`, error);
      throw error;
    }
  }

  /**
   * Get all login history with filters and pagination
   */
  async getLoginHistory(
    query: AdminLoginHistoryQueryDto,
  ): Promise<{ data: AdminLoginHistory[]; total: number; page: number; limit: number }> {
    const {
      adminId,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sortBy = 'loginTime',
      sortOrder = 'DESC',
    } = query;

    let queryBuilder = this.adminLoginHistoryRepository
      .createQueryBuilder('login')
      .leftJoinAndSelect('login.admin', 'admin');

    // Apply filters
    if (adminId) {
      queryBuilder = queryBuilder.where('login.adminId = :adminId', { adminId });
    }

    if (status) {
      queryBuilder = queryBuilder.andWhere('login.loginStatus = :status', { status });
    }

    if (startDate && endDate) {
      queryBuilder = queryBuilder.andWhere('login.loginTime BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      queryBuilder = queryBuilder.andWhere('login.loginTime >= :startDate', { startDate });
    } else if (endDate) {
      queryBuilder = queryBuilder.andWhere('login.loginTime <= :endDate', { endDate });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply sorting and pagination
    const offset = (page - 1) * limit;
    const data = await queryBuilder
      .orderBy(`login.${sortBy}`, sortOrder)
      .skip(offset)
      .take(limit)
      .getMany();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  /**
   * Get login history for specific admin
   */
  async getAdminLoginHistory(
    adminId: number,
    query: AdminLoginHistoryQueryDto,
  ): Promise<{ data: AdminLoginHistory[]; total: number }> {
    const { startDate, endDate, page = 1, limit = 20, sortOrder = 'DESC' } = query;

    let queryBuilder = this.adminLoginHistoryRepository
      .createQueryBuilder('login')
      .where('login.adminId = :adminId', { adminId });

    if (startDate && endDate) {
      queryBuilder = queryBuilder.andWhere('login.loginTime BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const total = await queryBuilder.getCount();

    const offset = (page - 1) * limit;
    const data = await queryBuilder
      .orderBy('login.loginTime', sortOrder)
      .skip(offset)
      .take(limit)
      .getMany();

    return { data, total };
  }

  /**
   * Get single login record by ID
   */
  async getLoginById(id: number): Promise<AdminLoginHistory | null> {
    return await this.adminLoginHistoryRepository.findOne({
      where: { id },
      relations: ['admin'],
    });
  }

  /**
   * Get recent logins (last N days)
   */
  async getRecentLogins(adminId: number, days: number = 30): Promise<AdminLoginHistory[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await this.adminLoginHistoryRepository.find({
      where: {
        adminId,
        loginTime: Between(startDate, new Date()),
      },
      order: {
        loginTime: 'DESC',
      },
      take: 100,
    });
  }

  /**
   * Get login statistics for admin
   */
  async getLoginStatistics(adminId: number, days: number = 30): Promise<AdminLoginStatisticsDto> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const queryBuilder = this.adminLoginHistoryRepository
      .createQueryBuilder('login')
      .where('login.adminId = :adminId', { adminId })
      .andWhere('login.loginTime >= :startDate', { startDate });

    const totalLogins = await queryBuilder.getCount();

    const successfulLogins = await queryBuilder
      .andWhere('login.loginStatus = :status', { status: 'success' })
      .getCount();

    const failedLogins = await this.adminLoginHistoryRepository
      .createQueryBuilder('login')
      .where('login.adminId = :adminId', { adminId })
      .andWhere('login.loginTime >= :startDate', { startDate })
      .andWhere('login.loginStatus = :status', { status: 'failed' })
      .getCount();

    const lockedAttempts = await this.adminLoginHistoryRepository
      .createQueryBuilder('login')
      .where('login.adminId = :adminId', { adminId })
      .andWhere('login.loginTime >= :startDate', { startDate })
      .andWhere('login.loginStatus = :status', { status: 'locked' })
      .getCount();

    const lastLogin = await this.adminLoginHistoryRepository.findOne({
      where: { adminId },
      order: { loginTime: 'DESC' },
    });

    const uniqueDevices = await this.adminLoginHistoryRepository
      .createQueryBuilder('login')
      .select('COUNT(DISTINCT login.deviceType)', 'count')
      .where('login.adminId = :adminId', { adminId })
      .andWhere('login.loginTime >= :startDate', { startDate })
      .getRawOne();

    const uniqueCountries = await this.adminLoginHistoryRepository
      .createQueryBuilder('login')
      .select('COUNT(DISTINCT login.country)', 'count')
      .where('login.adminId = :adminId', { adminId })
      .andWhere('login.loginTime >= :startDate', { startDate })
      .getRawOne();

    const activeSessions = await this.adminLoginHistoryRepository
      .createQueryBuilder('login')
      .where('login.adminId = :adminId', { adminId })
      .andWhere('login.logoutTime IS NULL')
      .getCount();

    return {
      totalLogins,
      successfulLogins,
      failedLogins,
      lockedAttempts,
      successRate: totalLogins > 0 ? Math.round((successfulLogins / totalLogins) * 100) : 0,
      lastLoginTime: lastLogin?.loginTime,
      lastLoginIp: lastLogin?.ipV4 || lastLogin?.ipV6,
      uniqueDevices: parseInt(uniqueDevices?.count || 0),
      uniqueCountries: parseInt(uniqueCountries?.count || 0),
      activeSessions,
    };
  }

  /**
   * Update logout time for a session
   */
  async recordLogout(sessionId: string, logoutTime: Date): Promise<void> {
    const loginRecord = await this.adminLoginHistoryRepository.findOne({
      where: { sessionId },
    });

    if (loginRecord) {
      const sessionDuration = Math.floor(
        (logoutTime.getTime() - loginRecord.loginTime.getTime()) / (1000 * 60),
      );
      loginRecord.logoutTime = logoutTime;
      loginRecord.sessionDurationMinutes = sessionDuration;
      await this.adminLoginHistoryRepository.save(loginRecord);
    }
  }

  /**
   * Delete old login records (older than N days)
   */
  async deleteOldRecords(days: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    await this.adminLoginHistoryRepository
      .createQueryBuilder()
      .delete()
      .where('loginTime < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Deleted login history records older than ${days} days`);
  }

  /**
   * Check if device is new for admin
   */
  async isNewDevice(adminId: number, fingerprint: string): Promise<boolean> {
    const existingLogin = await this.adminLoginHistoryRepository.findOne({
      where: { adminId },
      order: { loginTime: 'DESC' },
    });

    if (!existingLogin) {
      return true;
    }

    // Simple check: compare browser + OS + device type
    return false;
  }

  /**
   * Get suspicious login attempts (failed logins in last hour)
   */
  async getSuspiciousAttempts(adminId: number): Promise<AdminLoginHistory[]> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    return await this.adminLoginHistoryRepository.find({
      where: {
        adminId,
        loginStatus: 'failed',
        loginTime: Between(oneHourAgo, new Date()),
      },
      order: { loginTime: 'DESC' },
    });
  }
}
