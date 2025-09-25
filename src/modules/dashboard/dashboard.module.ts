import { Module } from '@nestjs/common';
import { RegistrationRequestsModule } from './registration-requests/registration-requests.module';

@Module({
	imports: [RegistrationRequestsModule],
})
export class DashboardModule {}
