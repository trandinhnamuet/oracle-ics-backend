import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { UserPackageService } from './user-package.service';
import { CreateUserPackageDto, UpdateUserPackageDto, UserPackageQueryDto } from './dto/user-package.dto';

@Controller('user-packages')
export class UserPackageController {
  private readonly logger = new Logger(UserPackageController.name);

  constructor(private readonly userPackageService: UserPackageService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserPackageDto: CreateUserPackageDto) {
    return this.userPackageService.create(createUserPackageDto);
  }

  @Get()
  findAll(@Query() query: UserPackageQueryDto) {
    return this.userPackageService.findAll(query);
  }

  @Get('paid')
  getPaidSubscriptions() {
    return this.userPackageService.getPaidSubscriptions();
  }

  @Get('unpaid')
  getUnpaidSubscriptions() {
    return this.userPackageService.getUnpaidSubscriptions();
  }

  @Get('user/:userId')
  findByUserId(@Param('userId', ParseIntPipe) userId: number) {
    console.log('Fetching subscriptions for userId:', userId);
    this.logger.log(`Fetching subscriptions for userId: ${userId}`);
    return this.userPackageService.findByUserId(userId);
  }

  @Get('package/:packageId')
  findByPackageId(@Param('packageId', ParseIntPipe) packageId: number) {
    return this.userPackageService.findByPackageId(packageId);
  }

  @Get('user/:userId/package/:packageId')
  findByUserAndPackage(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('packageId', ParseIntPipe) packageId: number,
  ) {
    return this.userPackageService.findByUserAndPackage(userId, packageId);
  }

  @Get('stats/user/:userId/count')
  getUserSubscriptionCount(@Param('userId', ParseIntPipe) userId: number) {
    return this.userPackageService.getUserSubscriptionCount(userId);
  }

  @Get('stats/package/:packageId/count')
  getPackageSubscriptionCount(@Param('packageId', ParseIntPipe) packageId: number) {
    return this.userPackageService.getPackageSubscriptionCount(packageId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userPackageService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserPackageDto: UpdateUserPackageDto,
  ) {
    return this.userPackageService.update(id, updateUserPackageDto);
  }

  @Patch(':id/mark-paid')
  @HttpCode(HttpStatus.OK)
  markAsPaid(@Param('id', ParseIntPipe) id: number) {
    return this.userPackageService.markAsPaid(id);
  }

  @Patch(':id/mark-unpaid')
  @HttpCode(HttpStatus.OK)
  markAsUnpaid(@Param('id', ParseIntPipe) id: number) {
    return this.userPackageService.markAsUnpaid(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.userPackageService.remove(id);
  }

  @Delete('user/:userId/package/:packageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeByUserAndPackage(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('packageId', ParseIntPipe) packageId: number,
  ) {
    return this.userPackageService.removeByUserAndPackage(userId, packageId);
  }
}
