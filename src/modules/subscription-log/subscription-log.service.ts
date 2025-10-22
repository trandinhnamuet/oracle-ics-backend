import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionLog } from '../../entities/subscription-log.entity';
import { CreateSubscriptionLogDto } from './dto/create-subscription-log.dto';
import { UpdateSubscriptionLogDto } from './dto/update-subscription-log.dto';

@Injectable()
export class SubscriptionLogService {
  constructor(
    @InjectRepository(SubscriptionLog)
    private subscriptionLogRepository: Repository<SubscriptionLog>,
  ) {}

  async create(createSubscriptionLogDto: CreateSubscriptionLogDto): Promise<SubscriptionLog> {
    const subscriptionLog = this.subscriptionLogRepository.create(createSubscriptionLogDto);
    return await this.subscriptionLogRepository.save(subscriptionLog);
  }

  async logAction(
    subscriptionId: string,
    userId: number,
    action: string,
    statusOld?: string,
    statusNew?: string,
    description?: string,
    metadata?: any
  ): Promise<SubscriptionLog> {
    return await this.create({
      subscription_id: subscriptionId,
      user_id: userId,
      action,
      status_old: statusOld,
      status_new: statusNew,
      description,
      metadata,
    });
  }

  async findAll(): Promise<SubscriptionLog[]> {
    return await this.subscriptionLogRepository.find({
      relations: ['user', 'subscription'],
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findBySubscription(subscriptionId: string): Promise<SubscriptionLog[]> {
    return await this.subscriptionLogRepository.find({
      where: { subscription_id: subscriptionId },
      relations: ['user'],
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findByUser(userId: number): Promise<SubscriptionLog[]> {
    return await this.subscriptionLogRepository.find({
      where: { user_id: userId },
      relations: ['subscription'],
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findByAction(action: string): Promise<SubscriptionLog[]> {
    return await this.subscriptionLogRepository.find({
      where: { action },
      relations: ['user', 'subscription'],
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<SubscriptionLog> {
    const subscriptionLog = await this.subscriptionLogRepository.findOne({
      where: { id },
      relations: ['user', 'subscription'],
    });

    if (!subscriptionLog) {
      throw new NotFoundException(`Subscription log with ID ${id} not found`);
    }

    return subscriptionLog;
  }

  async update(id: string, updateSubscriptionLogDto: UpdateSubscriptionLogDto): Promise<SubscriptionLog> {
    const subscriptionLog = await this.findOne(id);
    
    Object.assign(subscriptionLog, updateSubscriptionLogDto);
    
    return await this.subscriptionLogRepository.save(subscriptionLog);
  }

  async remove(id: string): Promise<void> {
    const subscriptionLog = await this.findOne(id);
    await this.subscriptionLogRepository.remove(subscriptionLog);
  }

  // Specific action logging methods
  async logVmStart(subscriptionId: string, userId: number): Promise<SubscriptionLog> {
    return await this.logAction(
      subscriptionId,
      userId,
      'start_vm',
      'stopped',
      'running',
      'VM started by user'
    );
  }

  async logVmPause(subscriptionId: string, userId: number): Promise<SubscriptionLog> {
    return await this.logAction(
      subscriptionId,
      userId,
      'pause_vm',
      'running',
      'paused',
      'VM paused by user'
    );
  }

  async logVmRestart(subscriptionId: string, userId: number): Promise<SubscriptionLog> {
    return await this.logAction(
      subscriptionId,
      userId,
      'restart_vm',
      'running',
      'restarting',
      'VM restart requested by user'
    );
  }

  async logBackupCreate(subscriptionId: string, userId: number): Promise<SubscriptionLog> {
    return await this.logAction(
      subscriptionId,
      userId,
      'create_backup',
      undefined,
      undefined,
      'Backup creation requested by user'
    );
  }

  async logVmDelete(subscriptionId: string, userId: number): Promise<SubscriptionLog> {
    return await this.logAction(
      subscriptionId,
      userId,
      'delete_vm',
      'running',
      'deleted',
      'VM deletion requested by user'
    );
  }

  async logPasswordChange(subscriptionId: string, userId: number): Promise<SubscriptionLog> {
    return await this.logAction(
      subscriptionId,
      userId,
      'change_password',
      undefined,
      undefined,
      'Password change requested by user'
    );
  }

  async logConfigurationChange(subscriptionId: string, userId: number, newConfig?: any): Promise<SubscriptionLog> {
    return await this.logAction(
      subscriptionId,
      userId,
      'change_configuration',
      undefined,
      undefined,
      'Configuration change requested by user',
      { new_configuration: newConfig }
    );
  }

  async logAutoRenewToggle(subscriptionId: string, userId: number, enabled: boolean): Promise<SubscriptionLog> {
    return await this.logAction(
      subscriptionId,
      userId,
      'auto_renew',
      undefined,
      undefined,
      `Auto renew ${enabled ? 'enabled' : 'disabled'} by user`,
      { auto_renew: enabled }
    );
  }
}