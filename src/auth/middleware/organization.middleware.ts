import type { ApiMiddleware } from 'motia'
import { auth } from '../../lib/better-auth/auth'
import { db } from '../../lib/db/drizzle'
import { member, organization } from '../../lib/db/drizzle'
import { sql } from 'drizzle-orm'

/**
 * Safely extract the first string value from a header that may be an array
 */
function getFirstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}

/**
 * Convert request headers to HeadersInit format for Better Auth
 */
function toHeaders(reqHeaders: Record<string, string | string[] | undefined>): HeadersInit {
  const headers: Record<string, string> = {}

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
 * Organization membership middleware.
 *
 * Validates that the authenticated user is a member of the organization
 * specified in the request path parameters or query.
 *
 * Usage:
 * - The organization ID should be in pathParams as 'orgId' or queryParams as 'organizationId'
 * - Injects the member record into the request for downstream handlers
 */
export const organizationMiddleware: ApiMiddleware = async (req, ctx, next) => {
  const { logger } = ctx

  if (!req.user) {
    return {
      status: 401,
      body: { error: 'Unauthorized - Authentication required' },
    }
  }

  // Get organization ID from path params or query params
  const orgId = req.pathParams?.orgId || req.pathParams?.organizationId || (req.queryParams?.organizationId as string | undefined)

  if (!orgId) {
    logger.warn('Organization ID not found in request')
    return {
      status: 400,
      body: { error: 'Organization ID required' },
    }
  }

  try {
    // Check if user is a member of the organization
    const members = await db
      .select()
      .from(member)
      .where(
        sql`${member.organizationId} = ${orgId} AND ${member.userId} = ${req.user.id}`
      )
      .limit(1)

    if (!members || members.length === 0) {
      logger.warn('User is not a member of the organization', {
        userId: req.user.id,
        organizationId: orgId,
      })

      return {
        status: 403,
        body: { error: 'Forbidden - Not a member of this organization' },
      }
    }

    const memberRecord = members[0]

    // Inject member into request for handlers to use
    req.member = memberRecord
    req.organizationId = orgId

    logger.debug('Organization membership verified', {
      userId: req.user.id,
      organizationId: orgId,
      role: memberRecord.role,
    })

    return await next()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Organization middleware error', { error: message })

    return {
      status: 500,
      body: { error: 'Failed to verify organization membership' },
    }
  }
}

/**
 * Organization role-based authorization middleware.
 *
 * Validates that the authenticated user has one of the required roles
 * within the organization.
 *
 * @param allowedRoles - Array of roles that are allowed to access the route
 */
export const organizationRoleMiddleware =
  (allowedRoles: string[]): ApiMiddleware =>
  async (req, ctx, next) => {
    const { logger } = ctx

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized - Authentication required' },
      }
    }

    if (!req.member) {
      return {
        status: 400,
        body: { error: 'Organization membership not verified' },
      }
    }

    const userRole = req.member.role

    if (!allowedRoles.includes(userRole)) {
      logger.warn('User does not have required role', {
        userId: req.user.id,
        organizationId: req.organizationId,
        userRole,
        allowedRoles,
      })

      return {
        status: 403,
        body: { error: 'Forbidden - Insufficient permissions' },
      }
    }

    logger.debug('Organization role authorization verified', {
      userId: req.user.id,
      organizationId: req.organizationId,
      role: userRole,
    })

    return await next()
  }

/**
 * Check if user is owner of the organization
 */
export const organizationOwnerMiddleware: ApiMiddleware = async (req, ctx, next) => {
  return organizationRoleMiddleware(['owner'])(req, ctx, next)
}

/**
 * Check if user is admin or owner of the organization
 */
export const organizationAdminMiddleware: ApiMiddleware = async (req, ctx, next) => {
  return organizationRoleMiddleware(['owner', 'admin'])(req, ctx, next)
}
