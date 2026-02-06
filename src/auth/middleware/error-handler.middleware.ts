import type { ApiMiddleware } from 'motia'
import { ZodError } from 'zod'

/**
 * Centralized error handling middleware.
 *
 * Catches Zod validation errors and returns proper 400 responses.
 * Catches all other errors and returns 500 responses.
 *
 * Apply this middleware first in the middleware chain so it catches
 * errors from subsequent middlewares and handlers.
 */
export const errorHandlerMiddleware: ApiMiddleware = async (req, ctx, next) => {
  try {
    return await next()
  } catch (error: unknown) {
    const { logger } = ctx

    if (error instanceof ZodError) {
      logger.warn('Validation error', {
        issues: error.issues,
      })

      return {
        status: 400,
        body: {
          error: 'Validation failed',
          details: error.issues,
        },
      }
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    const stack = error instanceof Error ? error.stack : undefined

    logger.error('Unhandled error', {
      error: message,
      stack,
    })

    return {
      status: 500,
      body: { error: 'Internal server error' },
    }
  }
}
