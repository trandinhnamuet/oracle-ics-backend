import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Put, ForbiddenException, HttpCode, HttpStatus, Query, BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.create(createUserDto);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search = '',
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC',
  ) {
    const result = await this.userService.findAll(+page, +limit, search, sortBy, sortOrder);
    return {
      ...result,
      data: result.data.map(({ password, ...user }) => user),
    };
  }

  // Static routes must come before dynamic :id routes
  @Patch('me/profile')
  @UseGuards(JwtAuthGuard)
  async updateOwnProfile(
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    // Prevent updating sensitive fields
    const { password, role, email, isActive, ...allowedFields } = updateUserDto as any;
    const user = await this.userService.update(userId, allowedFields);
    const { password: _pw, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @Patch('me/change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    await this.userService.changePassword(userId, changePasswordDto);
    return { message: 'Mật khẩu đã được thay đổi thành công.' };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findOne(@Param('id') id: string) {
    const user = await this.userService.findOne(Number(id));
    if (!user) return null;
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    const user = await this.userService.update(Number(id), updateUserDto);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string) {
    await this.userService.remove(Number(id));
    return { message: 'User deleted successfully' };
  }

  @Put(':id/avatar')
  @UseGuards(JwtAuthGuard)
  async updateAvatar(
    @Param('id') id: string,
    @Body() body: { avatarUrl: string },
    @Req() req: any,
  ) {
    // Users can only update their own avatar
    if (req.user.id !== Number(id)) {
      throw new ForbiddenException('Unauthorized');
    }

    // SECURITY: Validate avatarUrl to prevent SSRF / abuse where the URL is
    // later fetched server-side (e.g. proxied, embedded in emails, scraped
    // for thumbnails). Restrictions:
    //   - must be a non-empty string under a sane length
    //   - must be a valid URL using the https: scheme (no http, file, data,
    //     javascript, gopher, etc.)
    //   - hostname must not resolve to localhost / link-local / private
    //     ranges / metadata service IPs
    if (!body || typeof body.avatarUrl !== 'string' || body.avatarUrl.length === 0) {
      throw new BadRequestException('avatarUrl is required');
    }
    if (body.avatarUrl.length > 2048) {
      throw new BadRequestException('avatarUrl is too long');
    }
    UserController.assertSafeAvatarUrl(body.avatarUrl);

    const user = await this.userService.updateAvatar(Number(id), body.avatarUrl);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Throws BadRequestException if the URL is not an HTTPS URL pointing to a
   * public host. Blocks localhost, IPv4 private ranges (10/8, 172.16/12,
   * 192.168/16), 169.254/16 (link-local + cloud metadata), 127/8, 0.0.0.0,
   * and IPv6 loopback / link-local / unique-local addresses.
   */
  private static assertSafeAvatarUrl(rawUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException('avatarUrl must be a valid URL');
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('avatarUrl must use the https scheme');
    }
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) {
      throw new BadRequestException('avatarUrl must include a hostname');
    }
    // Block obvious local hostnames
    const blockedHostnames = new Set([
      'localhost',
      'localhost.localdomain',
      'ip6-localhost',
      'ip6-loopback',
      'metadata',
      'metadata.google.internal',
    ]);
    if (blockedHostnames.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      throw new BadRequestException('avatarUrl host is not allowed');
    }

    // IPv4 literal check
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [a, b] = ipv4Match.slice(1).map(Number);
      const allOctets = ipv4Match.slice(1).map(Number);
      if (allOctets.some((o) => o < 0 || o > 255)) {
        throw new BadRequestException('avatarUrl host is not a valid IPv4 address');
      }
      // 0.0.0.0/8, 127.0.0.0/8, 10.0.0.0/8
      if (a === 0 || a === 127 || a === 10) {
        throw new BadRequestException('avatarUrl host is in a blocked range');
      }
      // 169.254.0.0/16 (link-local + AWS/GCP/Azure metadata)
      if (a === 169 && b === 254) {
        throw new BadRequestException('avatarUrl host is in a blocked range');
      }
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) {
        throw new BadRequestException('avatarUrl host is in a blocked range');
      }
      // 192.168.0.0/16
      if (a === 192 && b === 168) {
        throw new BadRequestException('avatarUrl host is in a blocked range');
      }
      // 100.64.0.0/10 (CGNAT)
      if (a === 100 && b >= 64 && b <= 127) {
        throw new BadRequestException('avatarUrl host is in a blocked range');
      }
    }

    // IPv6 literal check (URL hostnames keep brackets stripped on `.hostname`)
    if (hostname.includes(':')) {
      const v6 = hostname;
      // ::1 (loopback), :: (unspec), fe80::/10 (link-local), fc00::/7 (ULA)
      if (
        v6 === '::1' ||
        v6 === '::' ||
        v6.startsWith('fe8') ||
        v6.startsWith('fe9') ||
        v6.startsWith('fea') ||
        v6.startsWith('feb') ||
        v6.startsWith('fc') ||
        v6.startsWith('fd')
      ) {
        throw new BadRequestException('avatarUrl host is in a blocked range');
      }
    }
  }
}
