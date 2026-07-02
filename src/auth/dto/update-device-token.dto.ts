import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDeviceTokenDto {
  @ApiProperty({ example: 'fcm_token_1234567890', description: 'The Firebase Cloud Messaging (FCM) token of the user device' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class UpdateDeviceTokenResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-4956-a5cc-96dd4fcf05a6' })
  id: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: 'fcm_token_1234567890' })
  fcmToken: string;
}
