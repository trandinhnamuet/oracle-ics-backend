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
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageService } from './image.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Image } from './image.entity';

@Controller('images')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
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

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size too large. Maximum 5MB allowed');
    }

    const userId = req.user?.id;
    return await this.imageService.saveImage(file, userId);
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
