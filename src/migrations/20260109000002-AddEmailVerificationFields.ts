import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddEmailVerificationFields20260109000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Change is_active default to false
    await queryRunner.query(`
      ALTER TABLE oracle.users 
      ALTER COLUMN is_active SET DEFAULT false
    `);

    // Add email_verification_otp column
    await queryRunner.addColumn(
      'oracle.users',
      new TableColumn({
        name: 'email_verification_otp',
        type: 'varchar',
        length: '6',
        isNullable: true,
        comment: 'OTP code for email verification (6 digits)',
      }),
    );

    // Add otp_expires_at column
    await queryRunner.addColumn(
      'oracle.users',
      new TableColumn({
        name: 'otp_expires_at',
        type: 'timestamp',
        isNullable: true,
        comment: 'Expiration timestamp for OTP code',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns
    await queryRunner.dropColumn('oracle.users', 'otp_expires_at');
    await queryRunner.dropColumn('oracle.users', 'email_verification_otp');

    // Revert is_active default to true
    await queryRunner.query(`
      ALTER TABLE oracle.users 
      ALTER COLUMN is_active SET DEFAULT true
    `);
  }
}
