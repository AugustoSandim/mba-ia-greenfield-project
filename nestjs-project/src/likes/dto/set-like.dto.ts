import { IsIn, IsInt } from 'class-validator';

export class SetVideoLikeDto {
  @IsInt()
  @IsIn([1, -1])
  value: number;
}
