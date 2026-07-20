import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  expoPushToken: string;

  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}

export class UnregisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  expoPushToken: string;
}
