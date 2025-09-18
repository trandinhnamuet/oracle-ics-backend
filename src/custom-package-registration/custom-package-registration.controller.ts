import { Controller, Get, Post, Body, Param, Delete, Patch, HttpCode, HttpStatus } from '@nestjs/common';
import { CustomPackageRegistrationService } from './custom-package-registration.service';
import { CreateCustomPackageRegistrationDto } from '../entities/dto/custom-package-registration.dto';

@Controller('custom-package-registrations')
export class CustomPackageRegistrationController {
  constructor(private readonly customPackageRegistrationService: CustomPackageRegistrationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createCustomPackageRegistrationDto: CreateCustomPackageRegistrationDto) {
    return await this.customPackageRegistrationService.create(createCustomPackageRegistrationDto);
  }

  @Get()
  async findAll() {
    return await this.customPackageRegistrationService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.customPackageRegistrationService.findOne(+id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateData: Partial<CreateCustomPackageRegistrationDto> & { processed?: boolean }) {
    return await this.customPackageRegistrationService.update(+id, updateData);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return await this.customPackageRegistrationService.remove(+id);
  }
}