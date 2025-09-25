import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ schema: 'dashboard', name: 'registration_requests' })
export class RegistrationRequests {
	@PrimaryGeneratedColumn()
	id: number;

	@Column({ type: 'varchar', length: 100 })
	user_name: string;

	@Column({ type: 'varchar', length: 150 })
	email: string;

	@Column({ type: 'varchar', length: 20 })
	phone_number: string;

	@Column({ type: 'varchar', length: 150, nullable: true })
	company?: string;

	@Column({ type: 'text', nullable: true })
	additional_notes?: string;

	@Column({ type: 'varchar', length: 100 })
	plan_name: string;

	@Column({ type: 'text', nullable: true })
	plan_description?: string;

	@Column({ type: 'varchar', length: 50, nullable: true })
	plan_price?: string;

	@Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
	submitted_at: Date;

	@Column({ type: 'boolean', nullable: true })
	is_served?: boolean;
}
