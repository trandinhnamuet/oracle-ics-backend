import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegistrationRequests } from './registration-requests.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class RegistrationRequestsService {
	private readonly logger = new Logger(RegistrationRequestsService.name);

	constructor(
		@InjectRepository(RegistrationRequests)
		private readonly registrationRequestsRepository: Repository<RegistrationRequests>,
		private readonly emailService: EmailService,
	) {}

	async create(data: Partial<RegistrationRequests>): Promise<RegistrationRequests> {
		const entity = this.registrationRequestsRepository.create(data);
		const savedEntity = await this.registrationRequestsRepository.save(entity);
		this.logger.log(`Registration request saved (id=${savedEntity.id})`);

		// Gửi email bất đồng bộ, không chờ kết quả
		setImmediate(async () => {
			try {
				await this.emailService.sendRegistrationEbook(savedEntity);
				this.logger.log(`Email sent successfully for registration id=${savedEntity.id}`);
			} catch (error) {
				this.logger.error(`Error sending registration email (id=${savedEntity.id}):`, error?.stack || error?.message || error);
			}
		});

		return savedEntity;
	}

	async findAll(): Promise<RegistrationRequests[]> {
		return this.registrationRequestsRepository.find();
	}

	async findOne(id: number): Promise<RegistrationRequests | null> {
		return this.registrationRequestsRepository.findOneBy({ id });
	}

	async update(id: number, data: Partial<RegistrationRequests>): Promise<RegistrationRequests | null> {
		await this.registrationRequestsRepository.update(id, data);
		return this.findOne(id);
	}

	async remove(id: number): Promise<void> {
		await this.registrationRequestsRepository.delete(id);
	}
}
