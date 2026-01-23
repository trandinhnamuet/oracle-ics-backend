import { IsNumber, IsString, IsOptional } from 'class-validator';

export class TerminalConnectDto {
  @IsNumber()
  vmId: number;

  @IsString()
  @IsOptional()
  subscriptionId?: string;
}

export class TerminalResizeDto {
  @IsNumber()
  rows: number;

  @IsNumber()
  cols: number;
}
