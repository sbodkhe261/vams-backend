import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Company Gamma', description: 'Name of the company/tenant' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
