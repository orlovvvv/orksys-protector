import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { organizationMiddleware } from '../middleware/organization.middleware'

// Type for Better Auth leaveOrganization response
type LeaveOrganizationResult = {
  success: boolean
}

export const config: ApiRouteConfig = {
  name: 'LeaveOrganization',
  type: 'api',
  path: '/organizations/:orgId/leave',
  method: 'POST',
  description: 'Leave an organization',
  emits: ['organization.member.left'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware],
  responseSchema: {
    200: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    400: z.object({
      error: z.string(),
    }),
    401: z.object({
      error: z.string(),
    }),
    403: z.object({
      error: z.string(),
    }),
    500: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['LeaveOrganization'] = async (req, { emit, logger }) => {
  try {
    const orgId = req.pathParams?.orgId as string

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Leave organization request received', {
      userId: req.user.id,
      organizationId: orgId,
    })

    // Call Better Auth's leaveOrganization endpoint
    // Better Auth returns success/failure directly, or throws an error
    try {
      await auth.api.leaveOrganization({
        body: {
          organizationId: orgId,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as LeaveOrganizationResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to leave organization', {
        error: error.message || 'Unknown error',
        organizationId: orgId,
      })

      const errorMessage = error.message?.toLowerCase() || ''
      if (errorMessage.includes('owner') || errorMessage.includes('cannot')) {
        return {
          status: 400,
          body: { error: 'Cannot leave organization as owner. Transfer ownership first.' },
        }
      }
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist') || errorMessage.includes('not a member')) {
        return {
          status: 400,
          body: { error: 'You are not a member of this organization' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Failed to leave organization' },
      }
    }

    logger.info('Left organization successfully', {
      userId: req.user.id,
      organizationId: orgId,
    })

    // Emit event for audit logging
    await emit({
      topic: 'organization.member.left',
      data: {
        __topic: 'organization.member.left',
        organizationId: orgId,
        userId: req.user.id,
        userEmail: req.user.email,
      },
    })

    return {
      status: 200,
      body: {
        success: true,
        message: 'Left organization successfully',
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Leave organization error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to leave organization' },
    }
  }
}
