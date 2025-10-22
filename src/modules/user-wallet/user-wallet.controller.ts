import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UserWalletService } from './user-wallet.service';
import { CreateUserWalletDto } from './dto/create-user-wallet.dto';
import { UpdateUserWalletDto } from './dto/update-user-wallet.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('user-wallets')
export class UserWalletController {
  constructor(private readonly userWalletService: UserWalletService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createUserWalletDto: CreateUserWalletDto) {
    return await this.userWalletService.create(createUserWalletDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll() {
    return await this.userWalletService.findAll();
  }

  @Get('my-wallet')
  @UseGuards(JwtAuthGuard)
  async findMyWallet(@Request() req) {
    return await this.userWalletService.findByUserId(req.user.id);
  }

  @Get('my-balance')
  @UseGuards(JwtAuthGuard)
  async getMyBalance(@Request() req) {
    return await this.userWalletService.getBalance(req.user.id);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  async findByUserId(@Param('userId') userId: string) {
    return await this.userWalletService.findByUserId(parseInt(userId));
  }

  @Get('user/:userId/balance')
  @UseGuards(JwtAuthGuard)
  async getUserBalance(@Param('userId') userId: string) {
    return await this.userWalletService.getBalance(parseInt(userId));
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return await this.userWalletService.findOne(parseInt(id));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateUserWalletDto: UpdateUserWalletDto,
  ) {
    return await this.userWalletService.update(parseInt(id), updateUserWalletDto);
  }

  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard)
  async deactivate(@Param('id') id: string) {
    return await this.userWalletService.deactivate(parseInt(id));
  }

  @Patch(':id/activate')
  @UseGuards(JwtAuthGuard)
  async activate(@Param('id') id: string) {
    return await this.userWalletService.activate(parseInt(id));
  }
}