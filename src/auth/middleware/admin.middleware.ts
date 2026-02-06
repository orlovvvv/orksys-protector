import type { ApiMiddleware } from 'motia'

/**
 * Admin role middleware.
 *
 * Validates that the authenticated user has admin role.
 * Uses the Better Auth admin plugin's role system.
 */
export const adminMiddleware: ApiMiddleware = async (req, ctx, next) => {
  const { logger } = ctx

  if (!req.user) {
    return {
      status: 401,
      body: { error: 'Unauthorized - Authentication required' },
    }
  }

  // Check if user has admin role (stored in user.role by admin plugin)
  // Default admin roles from config are ['admin']
  const userRole = (req.user as any).role

  if (userRole !== 'admin') {
    logger.warn('User attempted to access admin resource without admin role', {
      userId: req.user.id,
      email: req.user.email,
      userRole,
    })

    return {
      status: 403,
      body: { error: 'Forbidden - Admin access required' },
    }
  }

  logger.debug('Admin authorization verified', {
    userId: req.user.id,
    email: req.user.email,
  })

  return await next()
}

/**
 * Check if user is banned (for routes that need to verify user status)
 */
export const checkBannedMiddleware: ApiMiddleware = async (req, ctx, next) => {
  const { logger } = ctx

  if (!req.user) {
    return {
      status: 401,
      body: { error: 'Unauthorized - Authentication required' },
    }
  }

  // Check if user is banned
  const banned = (req.user as any).banned

  if (banned) {
    const banReason = (req.user as any).banReason || 'No reason provided'
    const banExpires = (req.user as any).banExpires

    logger.warn('Banned user attempted to access resource', {
      userId: req.user.id,
      email: req.user.email,
      banReason,
      banExpires,
    })

    return {
      status: 403,
      body: {
        error: 'You have been banned from this application',
        reason: banReason,
        expiresAt: banExpires,
      },
    }
  }

  return await next()
}
