import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomPackageRegistration } from '../entities/custom-package-registration.entity';
import { CreateCustomPackageRegistrationDto } from '../entities/dto/custom-package-registration.dto';

@Injectable()
export class CustomPackageRegistrationService {
  constructor(
    @InjectRepository(CustomPackageRegistration)
    private customPackageRegistrationRepository: Repository<CustomPackageRegistration>,
  ) {}

  async create(createCustomPackageRegistrationDto: CreateCustomPackageRegistrationDto): Promise<CustomPackageRegistration> {
    const registration = this.customPackageRegistrationRepository.create(createCustomPackageRegistrationDto);
    return await this.customPackageRegistrationRepository.save(registration);
  }

  async findAll(): Promise<CustomPackageRegistration[]> {
    return await this.customPackageRegistrationRepository.find({
      order: { createdAt: 'DESC' }
    });
  }

  async findOne(id: number): Promise<CustomPackageRegistration | null> {
    return await this.customPackageRegistrationRepository.findOne({
      where: { id }
    });
  }

  async update(id: number, updateData: Partial<CreateCustomPackageRegistrationDto> & { processed?: boolean }): Promise<CustomPackageRegistration | null> {
    await this.customPackageRegistrationRepository.update(id, updateData);
    return await this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.customPackageRegistrationRepository.delete(id);
  }
}