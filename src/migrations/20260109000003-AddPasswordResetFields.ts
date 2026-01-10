import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPasswordResetFields20260109000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add password_reset_otp column
    await queryRunner.addColumn(
      'oracle.users',
      new TableColumn({
        name: 'password_reset_otp',
        type: 'varchar',
        length: '6',
        isNullable: true,
      })
    );

    // Add password_reset_otp_expires_at column
    await queryRunner.addColumn(
      'oracle.users',
      new TableColumn({
        name: 'password_reset_otp_expires_at',
        type: 'timestamp',
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop password_reset_otp_expires_at column
    await queryRunner.dropColumn('oracle.users', 'password_reset_otp_expires_at');

    // Drop password_reset_otp column
    await queryRunner.dropColumn('oracle.users', 'password_reset_otp');
  }
}
