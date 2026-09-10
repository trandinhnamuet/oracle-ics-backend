import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RegistrationRequestsService } from './registration-requests.service';
import { CreateRegistrationRequestDto } from './dto/create-registration-request.dto';
import { UpdateRegistrationRequestDto } from './dto/update-registration-request.dto';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { AdminGuard } from '../../../auth/admin.guard';

@Controller('dashboard/registration-requests')
export class RegistrationRequestsController {
	constructor(private readonly service: RegistrationRequestsService) {}

	// Public: the sign-up form on the marketing site posts here. Rate-limited
	// per IP because it sends an email to the submitted address (abuse: mail
	// bombing / SMTP-reputation damage via automated submissions).
	@Throttle({ default: { limit: 5, ttl: 60000 } })
	@Post()
	async create(@Body() data: CreateRegistrationRequestDto) {
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
		const row = await this.service.findOne(Number(id));
		// Answer 404 instead of 200-with-an-empty-body (QA 2026-09-11).
		if (!row) throw new NotFoundException(`Registration request ${id} not found`);
		return row;
	}

	@UseGuards(JwtAuthGuard, AdminGuard)
	@Patch(':id')
	async update(@Param('id') id: number, @Body() data: UpdateRegistrationRequestDto) {
		return this.service.update(Number(id), data);
	}

	@UseGuards(JwtAuthGuard, AdminGuard)
	@Delete(':id')
	async remove(@Param('id') id: number) {
		await this.service.remove(Number(id));
		return { deleted: true };
	}
}
