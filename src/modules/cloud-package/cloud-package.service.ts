import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloudPackage } from '../../entities/cloud-package.entity';
import { CreateCloudPackageDto } from './dto/create-cloud-package.dto';
import { UpdateCloudPackageDto } from './dto/update-cloud-package.dto';

@Injectable()
export class CloudPackageService {
  constructor(
    @InjectRepository(CloudPackage)
    private cloudPackageRepository: Repository<CloudPackage>,
  ) {}

  async create(createCloudPackageDto: CreateCloudPackageDto): Promise<CloudPackage> {
    const cloudPackage = this.cloudPackageRepository.create(createCloudPackageDto);
    return await this.cloudPackageRepository.save(cloudPackage);
  }

  async findAll(): Promise<CloudPackage[]> {
    return await this.cloudPackageRepository.find({
      order: {
        updated_at: 'DESC',
      },
    });
  }

  async findActive(): Promise<CloudPackage[]> {
    return await this.cloudPackageRepository.find({
      where: { is_active: true },
      order: {
        type: 'ASC',
        cost: 'ASC',
      },
    });
  }

  async findByType(type: string): Promise<CloudPackage[]> {
    return await this.cloudPackageRepository.find({
      where: { type, is_active: true },
      order: {
        cost: 'ASC',
      },
    });
  }

  async findOne(id: number): Promise<CloudPackage> {
    const cloudPackage = await this.cloudPackageRepository.findOne({
      where: { id },
    });

    if (!cloudPackage) {
      throw new NotFoundException(`Cloud package with ID ${id} not found`);
    }

    return cloudPackage;
  }

  async update(id: number, updateCloudPackageDto: UpdateCloudPackageDto): Promise<CloudPackage> {
    const cloudPackage = await this.findOne(id);
    
    Object.assign(cloudPackage, updateCloudPackageDto);
    
    return await this.cloudPackageRepository.save(cloudPackage);
  }

  async remove(id: number): Promise<void> {
    const cloudPackage = await this.findOne(id);
    await this.cloudPackageRepository.remove(cloudPackage);
  }

  async deactivate(id: number): Promise<CloudPackage> {
    const cloudPackage = await this.findOne(id);
    cloudPackage.is_active = false;
    return await this.cloudPackageRepository.save(cloudPackage);
  }

  async activate(id: number): Promise<CloudPackage> {
    const cloudPackage = await this.findOne(id);
    cloudPackage.is_active = true;
    return await this.cloudPackageRepository.save(cloudPackage);
  }
}