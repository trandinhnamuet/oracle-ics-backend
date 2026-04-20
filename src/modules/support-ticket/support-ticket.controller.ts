import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, Req, HttpCode, HttpStatus,
  UseInterceptors, UploadedFiles, BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { SupportTicketService } from './support-ticket.service';
import { CreateSupportTicketDto, UpdateSupportTicketDto } from './dto/support-ticket.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/optional-jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { ImageService } from '../image/image.service';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

@Controller('support-tickets')
export class SupportTicketController {
  constructor(
    private readonly service: SupportTicketService,
    private readonly imageService: ImageService,
  ) {}

  /** Upload files for a support ticket (images + PDF + common docs) */
  @Post('upload-files')
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadFiles(
    @UploadedFiles() files: any[],
    @Req() req: any,
  ): Promise<{ url: string; name: string; mimeType: string; size: number }[]> {
    if (!files || files.length === 0) return [];
    const userId: number | undefined = req?.user?.id;
    const results: { url: string; name: string; mimeType: string; size: number }[] = [];
    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(`File type '${file.mimetype}' is not allowed`);
      }
      const saved = await this.imageService.saveImage(file, userId);
      // Use the decoded originalName from the saved record (already fixed in saveImage)
      results.push({ url: saved.url, name: saved.originalName, mimeType: file.mimetype, size: file.size });
    }
    return results;
  }

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
  @UseGuards(JwtAuthGuard, AdminGuard)
  async stats() {
    return this.service.countByStatus();
  }

  /** Admin: update status / note */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSupportTicketDto,
    @Req() req: any,
  ) {
    return this.service.update(Number(id), dto, req.user?.id);
  }

  /** Admin: delete */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}
