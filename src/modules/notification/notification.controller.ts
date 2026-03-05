import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /** GET /notifications/my?page=1&limit=20 */
  @Get('my')
  async getMyNotifications(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = parseInt(page || '1', 10);
    const l = Math.min(parseInt(limit || '20', 10), 100);
    const result = await this.notificationService.findByUser(req.user.id, p, l);
    return {
      ...result,
      server_time: new Date().toISOString(),
    };
  }

  /** GET /notifications/my/unread-count */
  @Get('my/unread-count')
  async getUnreadCount(@Req() req: any) {
    const count = await this.notificationService.countUnread(req.user.id);
    return { count };
  }

  /** PATCH /notifications/mark-all-read */
  @Patch('mark-all-read')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@Req() req: any) {
    return this.notificationService.markAllRead(req.user.id);
  }

  /** PATCH /notifications/:id/read */
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const result = await this.notificationService.markRead(id, req.user.id);
    return result ?? { message: 'Notification not found or not owned by user' };
  }

  /** DELETE /notifications/clear-read */
  @Delete('clear-read')
  @HttpCode(HttpStatus.OK)
  async clearRead(@Req() req: any) {
    return this.notificationService.clearRead(req.user.id);
  }

  /** DELETE /notifications/:id */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const deleted = await this.notificationService.delete(id, req.user.id);
    return { deleted };
  }
}
