import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
