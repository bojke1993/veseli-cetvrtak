import type { FastifyInstance } from 'fastify';
import type { ImportColumn, ImportCommitRequest, ImportCommitResponse, ImportPreviewResponse } from '../api-types.js';
import type { Deps } from '../deps.js';
import { requireAdmin } from '../http/auth.js';
import { badRequest, HttpError } from '../http/errors.js';
import { buildTemplate, commitImport, IMPORT_COLUMNS, previewImport } from '../services/import.js';

const mappingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, { type: ['string', 'null'], maxLength: 200 }])),
} as const;

export async function registerImportRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/import/template', { preHandler: requireAdmin }, async (_request, reply) => {
    const buf = buildTemplate();
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="veseli-cetvrtak-sablon.xlsx"')
      .send(buf);
  });

  app.post('/import/preview', { preHandler: requireAdmin }, async (request): Promise<ImportPreviewResponse> => {
    if (!request.isMultipart()) throw badRequest('Očekuje se multipart/form-data sa poljem "file".');
    let buffer: Buffer | undefined;
    let token: string | undefined;
    let mapping: Partial<Record<ImportColumn, string | null>> | null = null;
    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'file') {
            await part.toBuffer();
            continue;
          }
          buffer = await part.toBuffer();
        } else if (part.fieldname === 'mapping' && typeof part.value === 'string' && part.value) {
          try {
            mapping = JSON.parse(part.value) as Partial<Record<ImportColumn, string | null>>;
          } catch {
            throw badRequest('Polje "mapping" nije ispravan JSON.');
          }
        } else if (part.fieldname === 'token' && typeof part.value === 'string') {
          token = part.value;
        }
      }
    } catch (e) {
      if (e instanceof HttpError) throw e;
      const code = (e as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE') throw new HttpError(413, 'too_large', 'Fajl je veći od 5 MB.');
      throw e;
    }
    if (!buffer && !token) throw badRequest('Nedostaje fajl (polje "file").');
    return previewImport(deps, { buffer, token, mapping });
  });

  app.post<{ Body: ImportCommitRequest }>(
    '/import/commit',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['token', 'mapping', 'playerMatches'],
          additionalProperties: false,
          properties: {
            token: { type: 'string', minLength: 1, maxLength: 64 },
            mapping: mappingSchema,
            playerMatches: {
              type: 'object',
              // null first: Ajv type coercion would otherwise turn null into 0 for the integer branch.
              additionalProperties: { anyOf: [{ type: 'null' }, { type: 'integer', minimum: 1 }, { type: 'string', enum: ['manual'] }] },
            },
            confirmReplace: { type: 'boolean' },
          },
        },
      },
    },
    async (request): Promise<ImportCommitResponse> => ({ imported: await commitImport(deps, request.member!, request.body) }),
  );
}
