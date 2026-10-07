import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Shared `?page=&limit=` query parameters for collection endpoints. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page ต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'page ต้องมีค่าตั้งแต่ 1 ขึ้นไป' })
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit ต้องเป็นจำนวนเต็ม' })
  @Min(1, { message: 'limit ต้องมีค่าตั้งแต่ 1 ขึ้นไป' })
  @Max(100, { message: 'limit ต้องไม่เกิน 100' })
  limit?: number = 20;

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 20);
  }

  get take(): number {
    return this.limit ?? 20;
  }
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): Record<string, unknown> {
  return {
    total,
    page,
    limit,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}
