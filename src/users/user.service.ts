import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { UserWallet } from '../entities/user-wallet.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { NotificationService } from '../modules/notification/notification.service';
import { NotificationType } from '../entities/notification.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserWallet)
    private readonly userWalletRepository: Repository<UserWallet>,
    private readonly notificationService: NotificationService,
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

  async changePassword(id: number, changePasswordDto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new BadRequestException('Người dùng không tồn tại.');

    if (!user.password) {
      throw new BadRequestException('Tài khoản này không có mật khẩu (đăng nhập qua Google). Vui lòng đặt mật khẩu trước.');
    }

    const isMatch = await bcrypt.compare(changePasswordDto.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng.');
    }

    const hashed = await bcrypt.hash(changePasswordDto.newPassword, 10);
    await this.userRepository.update(id, { password: hashed });

    await this.notificationService.notify(
      id,
      NotificationType.PASSWORD_CHANGED,
      '🔒 Mật khẩu đã được thay đổi',
      'Mật khẩu tài khoản của bạn vừa được cập nhật thành công. Nếu không phải bạn thực hiện, hãy liên hệ hỗ trợ ngay.',
    );
  }
}
