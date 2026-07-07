import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class IngestEventDto {
  @ApiProperty({ example: 'voice-inspection', description: 'Source system of the event' })
  @IsString()
  @IsNotEmpty()
  source: string;

  @ApiProperty({ example: 'DEFECT_CREATED', description: 'Type of the event' })
  @IsString()
  @IsNotEmpty()
  event_type: string;

  @ApiProperty({ example: 'b812efd9-a412-4011-9a99-b1d5e3cdae01', description: 'Tenant company ID' })
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ example: 'MALXW35848DJ29103', description: 'Vehicle Identification Number' })
  @IsString()
  @IsNotEmpty()
  vin: string;

  @ApiProperty({ example: 'Brake System Fluid Leak', description: 'Defect description matching catalog' })
  @IsString()
  @IsNotEmpty()
  defectName: string;

  @ApiProperty({ example: 'd50a29e4-bcde-4211-8fa1-71ca36df201a', required: false, description: 'ID of the user to assign the alert to' })
  @IsString()
  @IsOptional()
  assignedToUserId?: string;

  @ApiProperty({ enum: UserRole, example: 'WORKER', required: false, description: 'Role to assign the alert to' })
  @IsEnum(UserRole)
  @IsOptional()
  assignedToRole?: UserRole;
}
