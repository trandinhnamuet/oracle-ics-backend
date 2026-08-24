import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Image } from './image.entity';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

/**
 * Canonical on-disk extension for every mime type the upload endpoints accept.
 * Callers content-validate the mime (magic bytes) before reaching saveImage, so
 * this maps a *verified* type to the extension we control.
 *
 * An unknown mime is rejected rather than defaulted: this is the fail-closed
 * backstop that stops an unvetted type from ever reaching the filesystem.
 */
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
};

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

    // SECURITY: the stored extension comes from the caller-validated mime type,
    // never from originalName. A request with filename="test.exe" and
    // Content-Type: text/plain previously wrote a real .exe into uploads/ and
    // served it back under our own domain, turning the ticket attachment
    // feature into malware hosting (WSTG-BUSL-09 — Upload of Malicious Files).
    // originalName is still kept below for display only.
    const extension = MIME_EXTENSIONS[file.mimetype];
    if (!extension) {
      throw new BadRequestException(`Unsupported file type '${file.mimetype}'`);
    }

    // Generate unique filename. The random component must be a CSPRNG value, not
    // Math.random(): GET /images/serve/:filename is unauthenticated, so the filename
    // is the only thing guarding a stored file (ticket attachments, KYC docs, avatars)
    // against enumeration. Math.random() (xorshift128+) is predictable; use randomBytes.
    const timestamp = Date.now();
    const filename = `${timestamp}-${randomBytes(16).toString('hex')}${extension}`;
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
    // Do NOT eager-load the `user` relation: this record is returned to API
    // callers and the joined User entity leaks uploader PII (email, phone, idCard…).
    return await this.imageRepository.findOne({
      where: { id },
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
