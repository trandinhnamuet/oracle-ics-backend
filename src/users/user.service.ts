import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserWallet } from '../entities/user-wallet.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserWallet)
    private readonly userWalletRepository: Repository<UserWallet>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Nếu không truyền role thì mặc định là 'customer'
    if (!createUserDto.role) {
      createUserDto.role = 'customer';
    }
    const user = this.userRepository.create(createUserDto);
    const savedUser = await this.userRepository.save(user);

    // Tạo user_wallet cho user mới
    try {
      const userWallet = this.userWalletRepository.create({
        user_id: savedUser.id,
        balance: 0,
        currency: 'VND',
        is_active: true,
      });
      await this.userWalletRepository.save(userWallet);
    } catch (error) {
      // Log error but don't fail user creation
      console.error('Failed to create wallet for user:', savedUser.id, error);
    }

    return savedUser;
  }

  async findAll(): Promise<User[]> {
    return await this.userRepository.find();
  }

  async findOne(id: number): Promise<User | null> {
    return await this.userRepository.findOne({ where: { id } });
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
  await this.userRepository.update(id, updateUserDto);
  const user = await this.userRepository.findOne({ where: { id } });
  if (!user) throw new Error('User not found');
  return user;
  }

  async remove(id: number): Promise<void> {
    await this.userRepository.delete(id);
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({ where: { email } });
  }

  async updateAvatar(id: number, avatarUrl: string): Promise<User> {
    await this.userRepository.update(id, { avatarUrl });
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new Error('User not found');
    return user;
  }
}
