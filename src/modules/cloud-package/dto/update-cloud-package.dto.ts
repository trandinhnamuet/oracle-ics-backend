import { PartialType } from '@nestjs/mapped-types';
import { CreateCloudPackageDto } from './create-cloud-package.dto';

export class UpdateCloudPackageDto extends PartialType(CreateCloudPackageDto) {}