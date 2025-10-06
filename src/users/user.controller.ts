import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Put } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.create(createUserDto);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @Get()
  async findAll() {
    const users = await this.userService.findAll();
    return users.map(({ password, ...user }) => user);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.userService.findOne(Number(id));
    if (!user) return null;
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
  const user = await this.userService.update(Number(id), updateUserDto);
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
  }

  @Delete(':id')
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
      throw new Error('Unauthorized');
    }
    
    const user = await this.userService.updateAvatar(Number(id), body.avatarUrl);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
