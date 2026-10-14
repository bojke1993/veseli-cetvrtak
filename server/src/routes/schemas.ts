/** Reusable JSON schema fragments for route validation. */

export const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

export const day = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
export const direction = { type: 'string', enum: ['over', 'under'] } as const;
export const memberIdSchema = { type: 'integer', minimum: 1, maximum: 255 } as const;
export const reason = { type: 'string', maxLength: 1000 } as const;

export type IdParams = { Params: { id: number } };
