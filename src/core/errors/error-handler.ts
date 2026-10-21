import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from './app-error';

export function handleApiError(error: unknown) {
  // 1. Zod Validation Errors
  if (error instanceof ZodError) {
    const formattedIssues = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: formattedIssues.map((i) => (i.field ? `${i.field}: ${i.message}` : i.message)).join('; '),
          details: formattedIssues,
        },
      },
      { status: 400 }
    );
  }

  // 2. Custom AppErrors (NotFoundError, ConflictError, etc.)
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.statusCode }
    );
  }

  // 3. PostgreSQL Specific Error Codes
  const pgError = error as { code?: string; detail?: string; constraint?: string; message?: string };
  if (pgError && typeof pgError.code === 'string') {
    // 23505: Unique violation (e.g. double booking partial unique index)
    if (pgError.code === '23505') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SLOT_ALREADY_BOOKED',
            message: 'This time slot is already booked. Double booking is not permitted.',
            details: pgError.detail,
          },
        },
        { status: 409 }
      );
    }

    // 23503: Foreign key violation
    if (pgError.code === '23503') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'The referenced clinic or slot does not exist.',
            details: pgError.detail,
          },
        },
        { status: 404 }
      );
    }

    // 23514: Check constraint violation
    if (pgError.code === '23514') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CONSTRAINT_VIOLATION',
            message: 'Data does not satisfy constraints (e.g. end_time must be after start_time).',
            details: pgError.detail,
          },
        },
        { status: 400 }
      );
    }
  }

  // 4. Fallback unexpected errors
  const message = error instanceof Error ? error.message : 'An unexpected internal error occurred';
  console.error('[API Error]:', error);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'An internal server error occurred' : message,
      },
    },
    { status: 500 }
  );
}
