import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Query parameters Core Hub appends to the registered callback URL.
 * Nothing here is trusted until the state matches its cookie and the token
 * itself is verified through JWKS.
 *
 * `access_token` is optional here on purpose: the handler answers its absence
 * with 400 itself, after burning the state cookie (auth-contract 5.1).
 */
export class SsoCallbackQueryDto {
  @IsOptional()
  @IsString()
  access_token?: string;

  @IsOptional()
  @IsIn(['Bearer', 'bearer'])
  token_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  expires_in?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  state?: string;
}
