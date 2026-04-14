import { IsOptional, IsString } from 'class-validator';

export class SamlCallbackDto {
  @IsOptional()
  @IsString()
  SAMLResponse?: string;

  @IsOptional()
  @IsString()
  RelayState?: string;

  @IsOptional()
  @IsString()
  relayState?: string;
}
