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
import { AdminGuard } from '../../auth/admin.guard';

@Controller('wallet-transactions')
export class WalletTransactionController {
  constructor(private readonly walletTransactionService: WalletTransactionService) {}

  // Admin only. The wallet ledger is financial record-keeping: entries are
  // written by the billing flows in-process (payment, subscription, refund),
  // never by a customer request. This route previously accepted any
  // authenticated user, which allowed a customer to append arbitrary balance
  // movements to their own wallet.
  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
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
    @Query('amountFilter') amountFilter?: string,
  ) {
    if (req.user.role !== 'admin') throw new ForbiddenException();
    return await this.walletTransactionService.adminFindAll({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      userId: userId ? parseInt(userId) : undefined,
      month,
      amountFilter: (amountFilter === 'positive' || amountFilter === 'negative') ? amountFilter : undefined,
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

  // Admin only: returns every user's transactions of a given type.
  @Get('type/:type')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findByType(@Param('type') type: string) {
    return await this.walletTransactionService.findByType(type);
  }

  // Admin only: an arbitrary transaction id belongs to an arbitrary customer.
  // Customers read their own ledger through `my-transactions`, which is scoped
  // to req.user.id.
  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findOne(@Param('id') id: string) {
    return await this.walletTransactionService.findOne(id);
  }

  // Admin only. A ledger should be corrected with compensating entries rather
  // than edited in place; until that workflow exists, mutation is restricted to
  // administrators instead of any authenticated user.
  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(
    @Param('id') id: string,
    @Body() updateWalletTransactionDto: UpdateWalletTransactionDto,
  ) {
    return await this.walletTransactionService.update(id, updateWalletTransactionDto);
  }

  // Admin only, for the same reason as update().
  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string) {
    return await this.walletTransactionService.remove(id);
  }
}