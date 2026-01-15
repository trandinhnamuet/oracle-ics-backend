import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { UserSession } from './user-session.entity';

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredSessions() {
    this.logger.log('Starting cleanup of expired sessions');
    
    try {
      const result = await this.sessionRepository.delete({
        expiresAt: LessThan(new Date()),
      });
      
      this.logger.log(`Cleaned up ${result.affected || 0} expired sessions`);
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions:', error);
    }
  }
}
