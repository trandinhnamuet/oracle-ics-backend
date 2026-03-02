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

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only images are allowed');
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size too large. Maximum 5MB allowed');
    }

    const userId = req.user?.id;
    return await this.imageService.saveImage(file, userId);
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
