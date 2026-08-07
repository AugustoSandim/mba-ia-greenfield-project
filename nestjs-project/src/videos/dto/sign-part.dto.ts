import { IsInt, Max, Min } from 'class-validator';

export class SignPartDto {
  @IsInt()
  @Min(1)
  @Max(10000)
  partNumber: number;
}
