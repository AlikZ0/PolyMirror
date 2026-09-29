import type { ApiErrorBody } from '@polymirror/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './errors';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    let status = 500;
    let body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Internal server error' } };

    if (err instanceof AppError) {
      status = err.statusCode;
      body = { error: { code: err.code, message: err.message, details: err.details } };
    } else if (err instanceof ZodError) {
      status = 400;
      body = {
        error: {
          code: 'BAD_REQUEST',
          message: err.issues
            .map((i) => `${i.path.join('.') || 'request'}: ${i.message}`)
            .join('; '),
          details: err.issues,
        },
      };
    } else if ((err as FastifyError).statusCode === 429) {
      status = 429;
      body = { error: { code: 'RATE_LIMITED', message: 'Too many requests — please slow down' } };
    } else if ((err as FastifyError).statusCode && (err as FastifyError).statusCode! < 500) {
      status = (err as FastifyError).statusCode!;
      body = { error: { code: 'BAD_REQUEST', message: err.message } };
    }

    if (status >= 500) req.log.error({ err }, 'request failed');
    else req.log.info({ code: body.error.code, msg: body.error.message }, 'request rejected');
    void reply.status(status).send(body);
  });

  app.setNotFoundHandler((_req, reply) => {
    void reply
      .status(404)
      .send({ error: { code: 'NOT_FOUND', message: 'Route not found' } } satisfies ApiErrorBody);
  });
}
