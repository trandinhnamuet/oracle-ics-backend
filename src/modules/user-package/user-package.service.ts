import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { UserPackage } from '../../entities/user-package.entity';
import { CreateUserPackageDto, UpdateUserPackageDto, UserPackageQueryDto } from './dto/user-package.dto';

@Injectable()
export class UserPackageService {
  constructor(
    @InjectRepository(UserPackage)
    private readonly userPackageRepository: Repository<UserPackage>,
  ) {}

  async create(createUserPackageDto: CreateUserPackageDto): Promise<UserPackage> {
    // Check if user already subscribed to this package
    const existingSubscription = await this.userPackageRepository.findOne({
      where: {
        userId: createUserPackageDto.userId,
        packageId: createUserPackageDto.packageId,
      },
    });

    if (existingSubscription) {
      throw new ConflictException('User already subscribed to this package');
    }

    const userPackage = this.userPackageRepository.create(createUserPackageDto);
    return await this.userPackageRepository.save(userPackage);
  }

  async findAll(query?: UserPackageQueryDto): Promise<UserPackage[]> {
    const where: FindOptionsWhere<UserPackage> = {};

    if (query?.userId) {
      where.userId = query.userId;
    }

    if (query?.packageId) {
      where.packageId = query.packageId;
    }

    if (query?.isPaid !== undefined) {
      where.isPaid = query.isPaid;
    }

    return await this.userPackageRepository.find({
      where,
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<UserPackage> {
    const userPackage = await this.userPackageRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!userPackage) {
      throw new NotFoundException(`UserPackage with ID ${id} not found`);
    }

    return userPackage;
  }

  async findByUserAndPackage(userId: number, packageId: number): Promise<UserPackage | null> {
    return await this.userPackageRepository.findOne({
      where: { userId, packageId },
      relations: ['user'],
    });
  }

  async findByUserId(userId: number): Promise<UserPackage[]> {
    return await this.userPackageRepository.find({
      where: { userId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByPackageId(packageId: number): Promise<UserPackage[]> {
    return await this.userPackageRepository.find({
      where: { packageId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: number, updateUserPackageDto: UpdateUserPackageDto): Promise<UserPackage> {
    const userPackage = await this.findOne(id);

    // If updating userId or packageId, check for conflicts
    if (updateUserPackageDto.userId || updateUserPackageDto.packageId) {
      const userId = updateUserPackageDto.userId || userPackage.userId;
      const packageId = updateUserPackageDto.packageId || userPackage.packageId;

      const existingSubscription = await this.userPackageRepository.findOne({
        where: { userId, packageId },
      });

      if (existingSubscription && existingSubscription.id !== id) {
        throw new ConflictException('User already subscribed to this package');
      }
    }

    Object.assign(userPackage, updateUserPackageDto);
    return await this.userPackageRepository.save(userPackage);
  }

  async remove(id: number): Promise<void> {
    const userPackage = await this.findOne(id);
    await this.userPackageRepository.remove(userPackage);
  }

  async removeByUserAndPackage(userId: number, packageId: number): Promise<void> {
    const userPackage = await this.findByUserAndPackage(userId, packageId);
    if (!userPackage) {
      throw new NotFoundException('Subscription not found');
    }
    await this.userPackageRepository.remove(userPackage);
  }

  async markAsPaid(id: number): Promise<UserPackage> {
    return await this.update(id, { isPaid: true });
  }

  async markAsUnpaid(id: number): Promise<UserPackage> {
    return await this.update(id, { isPaid: false });
  }

  async getUserSubscriptionCount(userId: number): Promise<number> {
    return await this.userPackageRepository.count({
      where: { userId },
    });
  }

  async getPackageSubscriptionCount(packageId: number): Promise<number> {
    return await this.userPackageRepository.count({
      where: { packageId },
    });
  }

  async getPaidSubscriptions(): Promise<UserPackage[]> {
    return await this.userPackageRepository.find({
      where: { isPaid: true },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async getUnpaidSubscriptions(): Promise<UserPackage[]> {
    return await this.userPackageRepository.find({
      where: { isPaid: false },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }
}