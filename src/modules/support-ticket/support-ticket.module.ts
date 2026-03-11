import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from '../../entities/support-ticket.entity';
import { SupportTicketService } from './support-ticket.service';
import { SupportTicketController } from './support-ticket.controller';
import { ImageModule } from '../image/image.module';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket]), ImageModule],
  controllers: [SupportTicketController],
  providers: [SupportTicketService],
  exports: [SupportTicketService],
})
export class SupportTicketModule {}
