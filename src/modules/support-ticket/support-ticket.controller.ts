import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SupportTicketService } from './support-ticket.service';
import { CreateSupportTicketDto, UpdateSupportTicketDto } from './dto/support-ticket.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt-auth.guard';

@Controller('support-tickets')
export class SupportTicketController {
  constructor(private readonly service: SupportTicketService) {}

  /** Any visitor OR logged-in user can submit a ticket */
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSupportTicketDto, @Req() req: any) {
    const userId: number | undefined = req?.user?.id;
    return this.service.create(dto, userId);
  }

  /** Logged-in user: own tickets only */
  @Get('my')
  @UseGuards(JwtAuthGuard)
  async findMine(@Req() req: any) {
    return this.service.findByUser(req.user.id, req.user.email);
  }

  /** Admin: all tickets */
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Req() req: any) {
    if (req.user?.role !== 'admin') {
      return this.service.findByUser(req.user.id, req.user.email);
    }
    return this.service.findAll();
  }

  /** Admin: stats by status */
  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async stats() {
    return this.service.countByStatus();
  }

  /** Admin: update status / note */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSupportTicketDto,
    @Req() req: any,
  ) {
    return this.service.update(Number(id), dto, req.user?.id);
  }

  /** Admin: delete */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}
