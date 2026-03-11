import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, TicketStatus } from '../../entities/support-ticket.entity';
import { CreateSupportTicketDto, UpdateSupportTicketDto } from './dto/support-ticket.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../entities/notification.entity';

const STATUS_LABELS: Record<string, string> = {
  open: 'Mở',
  in_progress: 'Đang xử lý',
  resolved: 'Đã giải quyết',
  closed: 'Đã đóng',
};

@Injectable()
export class SupportTicketService {
  constructor(
    @InjectRepository(SupportTicket)
    private ticketRepo: Repository<SupportTicket>,
    private notificationService: NotificationService,
  ) {}

  async create(dto: CreateSupportTicketDto, userId?: number): Promise<SupportTicket> {
    const ticket = this.ticketRepo.create({
      ...dto,
      user_id: userId ?? undefined,
    });
    const saved = await this.ticketRepo.save(ticket);

    // Notify the logged-in user that their ticket was received
    if (userId) {
      await this.notificationService.notify(
        userId,
        NotificationType.SUPPORT_TICKET_CREATED,
        '🎫 Yêu cầu hỗ trợ đã được tiếp nhận',
        `Yêu cầu hỗ trợ #${saved.id} — "${saved.title}" đã được ghi nhận. Chúng tôi sẽ phản hồi sớm nhất có thể.`,
        { ticket_id: saved.id, title: saved.title },
        '🎫 Support request received',
        `Support request #${saved.id} — "${saved.title}" has been submitted. We will respond as soon as possible.`,
      );
    }

    return saved;
  }

  async findAll(): Promise<SupportTicket[]> {
    return this.ticketRepo.find({
      order: { created_at: 'DESC' },
      relations: ['user'],
    });
  }

  async findByUser(userId: number, email?: string): Promise<SupportTicket[]> {
    // Return tickets owned by this user account, plus any anonymous tickets
    // submitted with the same email (user_id = null) so nothing gets lost
    const qb = this.ticketRepo.createQueryBuilder('t');

    if (email) {
      qb.where('t.user_id = :userId', { userId })
        .orWhere('(t.user_id IS NULL AND t.email = :email)', { email });
    } else {
      qb.where('t.user_id = :userId', { userId });
    }

    return qb.orderBy('t.created_at', 'DESC').getMany();
  }

  async findOne(id: number): Promise<SupportTicket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!ticket) throw new NotFoundException(`Ticket #${id} not found`);
    return ticket;
  }

  async update(id: number, dto: UpdateSupportTicketDto, adminId?: number): Promise<SupportTicket> {
    const ticket = await this.findOne(id);
    const previousStatus = ticket.status;
    Object.assign(ticket, dto);
    if (dto.status === TicketStatus.RESOLVED && !ticket.resolved_at) {
      ticket.resolved_at = new Date();
      ticket.resolved_by = adminId ?? null;
    }
    const saved = await this.ticketRepo.save(ticket);

    // Notify owner if status changed and ticket belongs to a user
    if (ticket.user_id && dto.status && dto.status !== previousStatus) {
      const newLabel = STATUS_LABELS[dto.status] ?? dto.status;
      await this.notificationService.notify(
        ticket.user_id,
        NotificationType.SUPPORT_TICKET_UPDATED,
        '🔔 Cập nhật yêu cầu hỗ trợ',
        `Yêu cầu hỗ trợ #${id} — "${ticket.title}" đã được cập nhật trạng thái: ${newLabel}.`,
        { ticket_id: id, status: dto.status, title: ticket.title },
        '🔔 Support request updated',
        `Support request #${id} — "${ticket.title}" status updated: ${newLabel}.`,
      );
    }

    return saved;
  }

  async remove(id: number): Promise<void> {
    await this.ticketRepo.delete(id);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.ticketRepo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.status')
      .getRawMany();
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  }
}
