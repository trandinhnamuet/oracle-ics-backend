import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Req,
  Res,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageService } from './image.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Image } from './image.entity';
import { Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';

@Controller('images')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  }))
  async uploadImage(
    @UploadedFile() file: any,
    @Req() req: any,
  ): Promise<Image> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type via mimetype (declared by client — not authoritative)
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only images are allowed');
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size too large. Maximum 10MB allowed');
    }

    // SECURITY: Authoritative content-type check via magic bytes. The
    // mimetype above is supplied by the client and can be spoofed to slip in
    // executables or scripts disguised as images. Verify the actual file
    // header bytes before accepting the upload.
    if (!file.buffer || file.buffer.length < 12) {
      throw new BadRequestException('Invalid image file (empty or truncated)');
    }
    if (!ImageController.isValidImageBuffer(file.buffer)) {
      throw new BadRequestException(
        'Invalid file content. The file does not appear to be a valid image (JPEG, PNG, GIF, or WEBP).',
      );
    }

    const userId = req.user?.id;
    return await this.imageService.saveImage(file, userId);
  }

  /**
   * Validate that a file buffer starts with a known image magic-bytes signature.
   * - JPEG: FF D8 FF
   * - PNG : 89 50 4E 47 0D 0A 1A 0A
   * - GIF : 47 49 46 38 (GIF8 — covers GIF87a / GIF89a)
   * - WEBP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50  (RIFF....WEBP)
   */
  private static isValidImageBuffer(buf: Buffer): boolean {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return true; // JPEG
    }
    if (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return true; // PNG
    }
    if (
      buf.length >= 4 &&
      buf[0] === 0x47 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x38
    ) {
      return true; // GIF (GIF87a / GIF89a)
    }
    if (
      buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // "RIFF"
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50  // "WEBP"
    ) {
      return true; // WEBP
    }
    return false;
  }

  @Get('serve/:filename')
  serveFile(
    @Param('filename') filename: string,
    @Res() res: Response,
  ): void {
    // Sanitize filename to prevent path traversal
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = join(process.cwd(), 'uploads', safeFilename);
    if (!existsSync(filePath)) {
      res.status(404).json({ message: 'File not found' });
      return;
    }
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(filePath);
  }

  @Get(':id')
  async getImage(@Param('id') id: string): Promise<Image> {
    const image = await this.imageService.findById(id);
    if (!image) {
      throw new NotFoundException('Image not found');
    }
    return image;
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  async getUserImages(
    @Param('userId') userId: number,
    @Req() req: any,
  ): Promise<Image[]> {
    // Users can only get their own images
    if (req.user.id !== userId) {
      throw new ForbiddenException('Access denied');
    }
    
    return await this.imageService.findByUser(userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteImage(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<{ message: string }> {
    try {
      await this.imageService.deleteImage(id, req.user.id);
      return { message: 'Image deleted successfully' };
    } catch (error) {
      if (error.message === 'Image not found') {
        throw new NotFoundException('Image not found');
      }
      if (error.message === 'Unauthorized to delete this image') {
        throw new ForbiddenException('Access denied');
      }
      throw error;
    }
  }
}
