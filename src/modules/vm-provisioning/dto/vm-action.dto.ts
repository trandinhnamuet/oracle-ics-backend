import { IsEnum } from 'class-validator';

export enum VmActionType {
  START = 'START',
  STOP = 'STOP',
  RESTART = 'RESTART',
  TERMINATE = 'TERMINATE',
}

export class VmActionDto {
  @IsEnum(VmActionType)
  action: VmActionType;
}
