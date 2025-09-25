import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { RegistrationRequestsService } from './registration-requests.service';
import { RegistrationRequests } from './registration-requests.entity';

@Controller('dashboard/registration-requests')
export class RegistrationRequestsController {
	constructor(private readonly service: RegistrationRequestsService) {}

	@Post()
	async create(@Body() data: Partial<RegistrationRequests>) {
		return this.service.create(data);
	}

	@Get()
	async findAll() {
		return this.service.findAll();
	}

	@Get(':id')
	async findOne(@Param('id') id: number) {
		return this.service.findOne(Number(id));
	}

	@Patch(':id')
	async update(@Param('id') id: number, @Body() data: Partial<RegistrationRequests>) {
		return this.service.update(Number(id), data);
	}

	@Delete(':id')
	async remove(@Param('id') id: number) {
		await this.service.remove(Number(id));
		return { deleted: true };
	}
}
