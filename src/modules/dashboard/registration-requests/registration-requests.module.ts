import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistrationRequests } from './registration-requests.entity';
import { RegistrationRequestsService } from './registration-requests.service';
import { RegistrationRequestsController } from './registration-requests.controller';
import { EmailService } from '../email/email.service';

@Module({
    imports: [TypeOrmModule.forFeature([RegistrationRequests])],
    providers: [RegistrationRequestsService, EmailService],
    controllers: [RegistrationRequestsController],
})
export class RegistrationRequestsModule {}