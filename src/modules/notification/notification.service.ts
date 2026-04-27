import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../../entities/notification.entity';
import { CreateNotificationDto } from './dto/notification.dto';

export interface NotificationPage {
  items: Notification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
  ) {}

  /** Create a notification for a user */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepo.create({
      user_id: dto.user_id,
      type: dto.type,
      title: dto.title,
      message: dto.message,
      title_en: dto.title_en ?? null,
      message_en: dto.message_en ?? null,
      data: dto.data ?? null,
      is_read: false,
    });
    return this.notificationRepo.save(notification);
  }

  /** Helper: create notification without throwing on failure.
   *  titleEn / messageEn are optional English translations.
   *  If omitted, the notification will only have the default (Vietnamese) text. */
  async notify(
    userId: number,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, any>,
    titleEn?: string,
    messageEn?: string,
  ): Promise<void> {
    try {
      await this.create({ user_id: userId, type, title, message, data, title_en: titleEn, message_en: messageEn });
    } catch (err) {
      this.logger.error('Failed to create notification', err?.stack || err?.message || err);
    }
  }

  /** Get paginated notifications for a user */
  async findByUser(userId: number, page = 1, limit = 20): Promise<NotificationPage> {
    const skip = (page - 1) * limit;
    const [items, total] = await this.notificationRepo.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Count unread notifications for a user */
  async countUnread(userId: number): Promise<number> {
    return this.notificationRepo.count({
      where: { user_id: userId, is_read: false },
    });
  }

  /** Mark a single notification as read */
  async markRead(id: number, userId: number): Promise<Notification | null> {
    const notification = await this.notificationRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!notification) return null;
    notification.is_read = true;
    return this.notificationRepo.save(notification);
  }

  /** Mark all notifications for a user as read */
  async markAllRead(userId: number): Promise<{ updated: number }> {
    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ is_read: true })
      .where('user_id = :userId AND is_read = false', { userId })
      .execute();
    return { updated: result.affected ?? 0 };
  }

  /** Delete a notification (owner only) */
  async delete(id: number, userId: number): Promise<boolean> {
    const result = await this.notificationRepo.delete({ id, user_id: userId });
    return (result.affected ?? 0) > 0;
  }

  /** Delete all read notifications for a user */
  async clearRead(userId: number): Promise<{ deleted: number }> {
    const result = await this.notificationRepo.delete({ user_id: userId, is_read: true });
    return { deleted: result.affected ?? 0 };
  }
}
