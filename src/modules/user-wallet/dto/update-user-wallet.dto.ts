import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateUserWalletDto } from './create-user-wallet.dto';

// Wallet-F2: `balance` is intentionally NOT updatable via a generic PATCH — absolute
// balance overwrites bypass the locked, audited addBalance/deductBalance path and are a
// lost-update hazard. Balance changes must go through those methods (with a ledger row).
export class UpdateUserWalletDto extends PartialType(
  OmitType(CreateUserWalletDto, ['balance'] as const),
) {}