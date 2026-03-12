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
  Query,
  ForbiddenException,
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
  async findAll(@Request() req) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return await this.walletTransactionService.findAll();
  }

  /** Admin: lấy tất cả transactions với filter user + tháng, phân trang */
  @Get('admin/all')
  @UseGuards(JwtAuthGuard)
  async adminFindAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('month') month?: string, // format: YYYY-MM
  ) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return await this.walletTransactionService.adminFindAll({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      userId: userId ? parseInt(userId) : undefined,
      month,
    });
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