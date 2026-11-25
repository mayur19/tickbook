import type { z } from 'zod';
import { AppError } from './errors.js';

/** Parses untrusted input with a zod schema, raising a 400 envelope on failure. */
export const parse = <S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request validation failed', {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
};
