import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CloudPackageService } from './cloud-package.service';
import { CreateCloudPackageDto } from './dto/create-cloud-package.dto';
import { UpdateCloudPackageDto } from './dto/update-cloud-package.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';

@Controller('cloud-packages')
export class CloudPackageController {
  constructor(private readonly cloudPackageService: CloudPackageService) {}

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(@Body() createCloudPackageDto: CreateCloudPackageDto) {
    return await this.cloudPackageService.create(createCloudPackageDto);
  }

  // Admin only: returns the full catalogue (including inactive packages) for the
  // back-office "Package Management" screen. The public storefront uses the
  // unauthenticated `active` route below. Previously this had no guard, so a
  // low-privileged user could reach an admin API (WSTG-ATHN-04).
  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findAll() {
    return await this.cloudPackageService.findAll();
  }

  // Public: storefront browses active packages here.
  @Get('active')
  async findActive() {
    return await this.cloudPackageService.findActive();
  }

  @Get('type/:type')
  async findByType(@Param('type') type: string) {
    return await this.cloudPackageService.findByType(type);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.cloudPackageService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCloudPackageDto: UpdateCloudPackageDto,
  ) {
    return await this.cloudPackageService.update(id, updateCloudPackageDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.cloudPackageService.remove(id);
  }

  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    return await this.cloudPackageService.deactivate(id);
  }

  @Patch(':id/activate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async activate(@Param('id', ParseIntPipe) id: number) {
    return await this.cloudPackageService.activate(id);
  }
}