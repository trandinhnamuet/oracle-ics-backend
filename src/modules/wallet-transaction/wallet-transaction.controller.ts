import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WalletTransactionService } from './wallet-transaction.service';
import { CreateWalletTransactionDto } from './dto/create-wallet-transaction.dto';
import { UpdateWalletTransactionDto } from './dto/update-wallet-transaction.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('wallet-transactions')
export class WalletTransactionController {
  constructor(private readonly walletTransactionService: WalletTransactionService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createWalletTransactionDto: CreateWalletTransactionDto) {
    return await this.walletTransactionService.create(createWalletTransactionDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll() {
    return await this.walletTransactionService.findAll();
  }

  @Get('my-transactions')
  @UseGuards(JwtAuthGuard)
  async findMyTransactions(@Request() req) {
    return await this.walletTransactionService.findByUser(req.user.id);
  }

  @Get('my-stats')
  @UseGuards(JwtAuthGuard)
  async getMyStats(@Request() req) {
    return await this.walletTransactionService.getTransactionStats(req.user.id);
  }

  @Get('type/:type')
  @UseGuards(JwtAuthGuard)
  async findByType(@Param('type') type: string) {
    return await this.walletTransactionService.findByType(type);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return await this.walletTransactionService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateWalletTransactionDto: UpdateWalletTransactionDto,
  ) {
    return await this.walletTransactionService.update(id, updateWalletTransactionDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    return await this.walletTransactionService.remove(id);
  }
}