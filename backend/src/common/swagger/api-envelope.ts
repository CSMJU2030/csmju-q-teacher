import { Type, applyDecorators } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  getSchemaPath,
} from '@nestjs/swagger';

/** `meta` of every collection (api-conventions.md 3 and 5). */
export class PaginationMetaModel {
  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

/** What a successful DELETE answers: `{ id, deleted: true }` - never 204 (api-conventions.md 2). */
export class DeletedModel {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: true })
  deleted!: boolean;
}

interface EnvelopeOptions {
  /** 201 for POST, 200 for everything else. */
  status?: 200 | 201;
  /** A collection: `data` is an array and `meta` is present. */
  collection?: boolean;
}

/**
 * Documents the `{ success, data[, meta] }` envelope that ResponseInterceptor
 * puts around every answer, so `openapi.json` describes what the API really
 * sends and the frontend can generate its types from it (tech-stack.md 3).
 */
export function ApiEnvelope<T>(model: Type<T>, options: EnvelopeOptions = {}) {
  const respond = options.status === 201 ? ApiCreatedResponse : ApiOkResponse;
  const collection = options.collection === true;

  return applyDecorators(
    ApiExtraModels(PaginationMetaModel, model),
    respond({
      schema: {
        type: 'object',
        required: collection ? ['success', 'data', 'meta'] : ['success', 'data'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: collection
            ? { type: 'array', items: { $ref: getSchemaPath(model) } }
            : { $ref: getSchemaPath(model) },
          ...(collection ? { meta: { $ref: getSchemaPath(PaginationMetaModel) } } : {}),
        },
      },
    }),
  );
}
