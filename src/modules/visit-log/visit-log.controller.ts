import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { VisitLogService, isVisitRange, VisitRange } from './visit-log.service'
import { TrackVisitDto } from '../../entities/dto/track-visit.dto'
import { JwtAuthGuard } from '../../auth/jwt-auth.guard'
import { AdminGuard } from '../../auth/admin.guard'

@Controller('visits')
export class VisitLogController {
  private readonly logger = new Logger(VisitLogController.name)

  constructor(private readonly visitLogService: VisitLogService) {}

  /**
   * Beacon từ trình duyệt khách — công khai, không cần đăng nhập.
   *
   * Giới hạn 120 lượt/phút/IP: đủ rộng cho một văn phòng đi chung NAT bấm qua
   * lại nhiều trang, nhưng vẫn chặn được việc bơm rác vào bảng.
   */
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Post('track')
  @HttpCode(204)
  async track(@Body() dto: TrackVisitDto, @Req() request: any): Promise<void> {
    try {
      // SECURITY: IP lấy từ request.ip, tuyệt đối không nhận từ body hay từ
      // X-Forwarded-For do client gửi. Express dựng request.ip từ socket và —
      // vì main.ts ghim `trust proxy: 'loopback'` — chỉ chấp nhận XFF do nginx
      // nội bộ thêm vào, một chặng mà client không vượt qua được.
      const ip: string | null =
        request.ip || request.socket?.remoteAddress || null
      const userAgent = String(request.headers?.['user-agent'] || '')

      await this.visitLogService.recordVisit(dto, normalizeIp(ip), userAgent)
    } catch (error) {
      // Đo đạc hỏng thì thôi, không được để ảnh hưởng tới khách đang xem trang.
      this.logger.warn(
        `Không ghi được lượt truy cập: ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  /** Số liệu cho màn hình Nhật ký truy cập bên admin. */
  @Get('stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async stats(
    @Query('range') range?: string,
    @Query('page') page?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const resolved: VisitRange = isVisitRange(range) ? range : '7d'
    const pageNo = Math.max(1, Math.floor(Number(page)) || 1)
    return this.visitLogService.getStats(resolved, pageNo, q ?? '', from, to)
  }
}

/** ::ffff:1.2.3.4 → 1.2.3.4, ::1 → 127.0.0.1 — cho dễ đọc và dễ gộp. */
function normalizeIp(ip: string | null): string | null {
  if (!ip) return null
  const s = ip.trim()
  if (s.startsWith('::ffff:')) return s.slice(7)
  if (s === '::1') return '127.0.0.1'
  return s
}
