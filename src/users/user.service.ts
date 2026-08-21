import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { UserWallet } from '../entities/user-wallet.entity';
import { UserSession } from '../auth/user-session.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { NotificationService } from '../modules/notification/notification.service';
import { NotificationType } from '../entities/notification.entity';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserWallet)
    private readonly userWalletRepository: Repository<UserWallet>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    private readonly notificationService: NotificationService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Nếu không truyền role thì mặc định là 'customer'
    if (!createUserDto.role) {
      createUserDto.role = 'customer';
    }
    // Never persist a plaintext password: the entity has no @BeforeInsert hook,
    // and login compares via bcrypt, so an unhashed value would also lock the user out.
    const toCreate: CreateUserDto = { ...createUserDto };
    if (toCreate.password) {
      toCreate.password = await bcrypt.hash(toCreate.password, 10);
    }
    const user = this.userRepository.create(toCreate);
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
      this.logger.error(`Failed to create wallet for user ${savedUser.id}`, error?.stack || error?.message || error);
    }

    return savedUser;
  }

  private readonly sortableColumns: Record<string, string> = {
    id: 'user.id',
    email: 'user.email',
    firstName: 'user.firstName',
    lastName: 'user.lastName',
    company: 'user.company',
    role: 'user.role',
    isActive: 'user.isActive',
    createdAt: 'user.createdAt',
    updatedAt: 'user.updatedAt',
  };

  async findAll(
    page = 1,
    limit = 20,
    search = '',
    sortBy = 'createdAt',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ): Promise<{ data: User[]; total: number; totalActive: number; totalInactive: number; page: number; limit: number; totalPages: number }> {
    const query = this.userRepository.createQueryBuilder('user');

    if (search?.trim()) {
      // Split into tokens and AND them: each token must appear in at least one searchable field.
      // This handles full-name searches with spaces (e.g. "Nguyen Ann") regardless of which
      // field (first_name / last_name) each part is stored in, without relying on CONCAT
      // which TypeORM does not map inside SQL function arguments.
      const tokens = search.trim().split(/\s+/).filter(Boolean);
      tokens.forEach((token, idx) => {
        const p = `s${idx}`;
        query.andWhere(
          `(user.email ILIKE :${p} OR user.first_name ILIKE :${p} OR user.last_name ILIKE :${p} OR user.company ILIKE :${p})`,
          { [p]: `%${token}%` },
        );
      });
    }

    const col = this.sortableColumns[sortBy] ?? 'user.createdAt';
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const [data, total] = await query
      .orderBy(col, order)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Global active/inactive counts (independent of search/page)
    const [totalActive, totalInactive] = await Promise.all([
      this.userRepository.count({ where: { isActive: true } }),
      this.userRepository.count({ where: { isActive: false } }),
    ]);

    return { data, total, totalActive, totalInactive, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number): Promise<User | null> {
    return await this.userRepository.findOne({ where: { id } });
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
  // Hash any password coming through the admin update path (UpdateUserDto still
  // carries an optional password); otherwise it would overwrite the bcrypt hash
  // with plaintext and lock the user out.
  const toUpdate: UpdateUserDto = { ...updateUserDto };
  if (toUpdate.password) {
    toUpdate.password = await bcrypt.hash(toUpdate.password, 10);
  }
  await this.userRepository.update(id, toUpdate);
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
    // password is select:false on the entity; opt it in explicitly — it is
    // required for the bcrypt comparison of the current password below.
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id })
      .addSelect('user.password')
      .getOne();
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

    // Revoke every session after a password change so a stolen refresh token (or a
    // session on another device) cannot outlive the change. Mirrors resetPassword.
    await this.sessionRepository.delete({ userId: String(id) });

    await this.notificationService.notify(
      id,
      NotificationType.PASSWORD_CHANGED,
      '🔒 Mật khẩu đã được thay đổi',
      'Mật khẩu tài khoản của bạn vừa được cập nhật thành công. Nếu không phải bạn thực hiện, hãy liên hệ hỗ trợ ngay.',
      undefined,
      '🔒 Password changed',
      'Your account password was updated successfully. If you did not do this, contact support immediately.',
    );
  }
}
