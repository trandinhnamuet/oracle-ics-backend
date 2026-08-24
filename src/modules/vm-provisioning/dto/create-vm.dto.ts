import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, Matches } from 'class-validator';

// A single-line OpenSSH public key: "<type> <base64>[ comment]". The single-line
// anchored pattern rejects embedded newlines, preventing injection of extra
// directives into the cloud-init YAML / authorized_keys the key is written into.
const SSH_PUBLIC_KEY_REGEX =
  /^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp(256|384|521)) [A-Za-z0-9+/]+={0,3}( [^\n\r]*)?$/;

export class CreateVmDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  // Anchored OCID pattern: rejects embedded CR/LF (log forging) and any non-OCID value.
  @IsString()
  @IsNotEmpty()
  @Matches(/^ocid1\.[a-zA-Z0-9._-]+$/, { message: 'imageId must be a valid OCID' })
  imageId: string;

  @IsString()
  @IsNotEmpty()
  shape: string;

  @IsNumber()
  @Min(1)
  @Max(64)
  @IsOptional()
  ocpus?: number;

  @IsNumber()
  @Min(1)
  @Max(1024)
  @IsOptional()
  memoryInGBs?: number;

  @IsNumber()
  @Min(50)
  @Max(32768)
  @IsOptional()
  bootVolumeSizeInGBs?: number;

  @IsString()
  @IsNotEmpty()
  @Matches(SSH_PUBLIC_KEY_REGEX, { message: 'userSshPublicKey must be a valid single-line OpenSSH public key' })
  userSshPublicKey: string;

  @IsString()
  @IsOptional()
  userSshPrivateKey?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  subscriptionId?: string;
}
