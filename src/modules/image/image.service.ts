import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Image } from './image.entity';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ImageService {
  constructor(
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
  ) {}

  async saveImage(
    file: any,
    uploadedBy?: number,
  ): Promise<Image> {
    // Re-decode originalname: multer/busboy parses multipart headers as latin-1
    // but browsers send UTF-8 bytes, causing garbled non-ASCII filenames.
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = path.extname(originalName);
    const filename = `${timestamp}-${Math.random().toString(36).substring(2)}${extension}`;
    const filePath = path.join(uploadsDir, filename);

    // Save file to disk
    fs.writeFileSync(filePath, file.buffer);

    // Create database record
    const image = this.imageRepository.create({
      filename,
      originalName,
      mimeType: file.mimetype,
      size: file.size,
      path: filePath,
      url: `/images/serve/${filename}`,
      uploadedBy,
    });

    return await this.imageRepository.save(image);
  }

  async findById(id: string): Promise<Image | null> {
    return await this.imageRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async findByUser(userId: number): Promise<Image[]> {
    return await this.imageRepository.find({
      where: { uploadedBy: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteImage(id: string, userId?: number): Promise<void> {
    const image = await this.findById(id);
    
    if (!image) {
      throw new Error('Image not found');
    }

    // Check if user owns the image (if userId is provided)
    if (userId && image.uploadedBy !== userId) {
      throw new Error('Unauthorized to delete this image');
    }

    // Delete file from disk
    if (fs.existsSync(image.path)) {
      fs.unlinkSync(image.path);
    }

    // Delete database record
    await this.imageRepository.delete(id);
  }
}
