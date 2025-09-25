import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegistrationRequests } from './registration-requests.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class RegistrationRequestsService {
	constructor(
		@InjectRepository(RegistrationRequests)
		private readonly registrationRequestsRepository: Repository<RegistrationRequests>,
		private readonly emailService: EmailService,
	) {}

	async create(data: Partial<RegistrationRequests>): Promise<RegistrationRequests> {
		const entity = this.registrationRequestsRepository.create(data);
		const savedEntity = await this.registrationRequestsRepository.save(entity);
		console.log('Saved entity:', savedEntity);
		
		// Gửi email bất đồng bộ, không chờ kết quả
		setImmediate(async () => {
			try {
				await this.emailService.sendRegistrationEbook(savedEntity);
				console.log('Email sent successfully for registration:', savedEntity.id);
			} catch (error) {
				console.error('Error sending registration email:', error);
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
