import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
