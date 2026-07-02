import { Controller, Get, Post, Body, Param, Delete, Patch, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { CustomPackageRegistrationService } from './custom-package-registration.service';
import { CreateCustomPackageRegistrationDto } from '../entities/dto/custom-package-registration.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('custom-package-registrations')
export class CustomPackageRegistrationController {
  constructor(private readonly customPackageRegistrationService: CustomPackageRegistrationService) {}

  // Public: the homepage "custom package" enquiry form submits here without auth.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createCustomPackageRegistrationDto: CreateCustomPackageRegistrationDto) {
    return await this.customPackageRegistrationService.create(createCustomPackageRegistrationDto);
  }

  // Admin only: reading/updating/deleting submitted enquiries exposes customer
  // contact data and is a back-office operation. These routes were previously
  // unauthenticated (WSTG-ATHN-04 — Bypassing Authentication Schema).
  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findAll() {
    return await this.customPackageRegistrationService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findOne(@Param('id') id: string) {
    return await this.customPackageRegistrationService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(@Param('id') id: string, @Body() updateData: Partial<CreateCustomPackageRegistrationDto> & { processed?: boolean }) {
    return await this.customPackageRegistrationService.update(+id, updateData);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return await this.customPackageRegistrationService.remove(+id);
  }
}