import type { ApiMiddleware } from 'motia'
import { auth } from '../../lib/better-auth/auth'

/**
 * Safely extract the first string value from a header that may be an array
 */
function getFirstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}

/**
 * Convert request headers to HeadersInit format for Better Auth
 * Only includes common auth-related headers for security
 */
function toHeaders(reqHeaders: Record<string, string | string[] | undefined>): HeadersInit {
  const headers: Record<string, string> = {}

  // Only process headers we expect for authentication
  const allowedHeaders = ['authorization', 'cookie', 'x-forwarded-for', 'x-real-ip']

  for (const key of allowedHeaders) {
    const value = getFirstHeaderValue(reqHeaders[key])
    if (value !== undefined) {
      headers[key] = value
    }
  }

  return headers
}

/**
 * Authentication middleware for protecting routes.
 *
 * Validates Bearer tokens (session tokens or API keys) from the Authorization header.
 * If valid, injects the session into the request context for downstream handlers.
 *
 * Better Auth's bearer plugin handles both session tokens and API keys transparently,
 * so this middleware works for both authentication methods.
 */
export const authMiddleware: ApiMiddleware = async (req, ctx, next) => {
  const { logger } = ctx

  try {
    // Try to get session from Better Auth
    // Better Auth checks both cookie and Authorization: Bearer header
    const session = await auth.api.getSession({
      headers: toHeaders(req.headers) as Headers,
    })

    if (!session) {
      logger.warn('Unauthorized request', {
        hasAuthHeader: !!req.headers['authorization'],
        hasCookie: !!req.headers['cookie'],
      })

      return {
        status: 401,
        body: { error: 'Unauthorized - Valid authentication required' },
      }
    }

    // Inject session and user into request for handlers to use
    req.session = session
    req.user = session.user

    logger.debug('Request authenticated', {
      userId: session.user.id,
      email: session.user.email,
    })

    return await next()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Authentication middleware error', { error: message })

    return {
      status: 401,
      body: { error: 'Authentication failed' },
    }
  }
}

/**
 * Optional authentication middleware.
 *
 * Unlike authMiddleware, this allows requests to proceed even if not authenticated.
 * Use this for endpoints that have enhanced features for authenticated users
 * but work for anonymous users too.
 */
export const optionalAuthMiddleware: ApiMiddleware = async (req, ctx, next) => {
  const { logger } = ctx

  try {
    const session = await auth.api.getSession({
      headers: toHeaders(req.headers) as Headers,
    })

    if (session) {
      // Inject session if available
      req.session = session
      req.user = session.user
      logger.debug('Optional auth - user authenticated', {
        userId: session.user.id,
      })
    } else {
      logger.debug('Optional auth - no session provided')
    }

    return await next()
  } catch {
    // On error, proceed without authentication
    return await next()
  }
}
