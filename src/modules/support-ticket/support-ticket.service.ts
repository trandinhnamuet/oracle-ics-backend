import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, TicketStatus } from '../../entities/support-ticket.entity';
import { CreateSupportTicketDto, UpdateSupportTicketDto } from './dto/support-ticket.dto';

@Injectable()
export class SupportTicketService {
  constructor(
    @InjectRepository(SupportTicket)
    private ticketRepo: Repository<SupportTicket>,
  ) {}

  async create(dto: CreateSupportTicketDto, userId?: number): Promise<SupportTicket> {
    const ticket = this.ticketRepo.create({
      ...dto,
      user_id: userId ?? undefined,
    });
    return this.ticketRepo.save(ticket);
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
    Object.assign(ticket, dto);
    if (dto.status === TicketStatus.RESOLVED && !ticket.resolved_at) {
      ticket.resolved_at = new Date();
      ticket.resolved_by = adminId ?? null;
    }
    return this.ticketRepo.save(ticket);
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
