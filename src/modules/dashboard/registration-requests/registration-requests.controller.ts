import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { RegistrationRequestsService } from './registration-requests.service';
import { RegistrationRequests } from './registration-requests.entity';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { AdminGuard } from '../../../auth/admin.guard';

@Controller('dashboard/registration-requests')
export class RegistrationRequestsController {
	constructor(private readonly service: RegistrationRequestsService) {}

	// Public: the sign-up form on the marketing site posts here.
	@Post()
	async create(@Body() data: Partial<RegistrationRequests>) {
		return this.service.create(data);
	}

	// Admin only from here down: these records hold customer names, e-mail
	// addresses, phone numbers, company details and free-text notes. They were
	// previously readable, editable and deletable without any authentication.
	@UseGuards(JwtAuthGuard, AdminGuard)
	@Get()
	async findAll() {
		return this.service.findAll();
	}

	@UseGuards(JwtAuthGuard, AdminGuard)
	@Get(':id')
	async findOne(@Param('id') id: number) {
		return this.service.findOne(Number(id));
	}

	@UseGuards(JwtAuthGuard, AdminGuard)
	@Patch(':id')
	async update(@Param('id') id: number, @Body() data: Partial<RegistrationRequests>) {
		return this.service.update(Number(id), data);
	}

	@UseGuards(JwtAuthGuard, AdminGuard)
	@Delete(':id')
	async remove(@Param('id') id: number) {
		await this.service.remove(Number(id));
		return { deleted: true };
	}
}
