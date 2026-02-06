import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { organizationMiddleware, organizationAdminMiddleware } from '../../middleware/organization.middleware'

// Type for Better Auth removeMember response
type RemoveMemberResult = {
  success: boolean
}

export const config: ApiRouteConfig = {
  name: 'RemoveOrganizationMember',
  type: 'api',
  path: '/organizations/:orgId/members/:memberId',
  method: 'DELETE',
  description: 'Remove a member from an organization',
  emits: ['organization.member.removed'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationAdminMiddleware],
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
    404: z.object({
      error: z.string(),
    }),
    500: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['RemoveOrganizationMember'] = async (req, { emit, logger }) => {
  try {
    const orgId = req.pathParams?.orgId as string
    const memberId = req.pathParams?.memberId as string

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Remove member request received', {
      userId: req.user.id,
      organizationId: orgId,
      memberId,
    })

    // Call Better Auth's removeMember endpoint
    // Better Auth returns success/failure directly, or throws an error
    try {
      // Type assertion: Better Auth API returns a complex type, we cast to our expected type
      await auth.api.removeMember({
        body: {
          organizationId: orgId,
          userIdOrMemberId: memberId,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as unknown as RemoveMemberResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to remove member', {
        error: error.message || 'Unknown error',
        organizationId: orgId,
        memberId,
      })

      const errorMessage = error.message?.toLowerCase() || ''
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return {
          status: 404,
          body: { error: 'Member not found' },
        }
      }
      if (errorMessage.includes('owner') || errorMessage.includes('last')) {
        return {
          status: 400,
          body: { error: 'Cannot remove the owner or last member' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Failed to remove member' },
      }
    }

    logger.info('Member removed successfully', {
      organizationId: orgId,
      userId: req.user.id,
      memberId,
    })

    // Emit event for audit logging
    // Type assertion: Emit data types are complex due to generated types, we cast to our expected type
    await emit({
      topic: 'organization.member.removed',
      data: {
        __topic: 'organization.member.removed',
        organizationId: orgId,
        memberId,
        removedByUserId: req.user.id,
        removedByUserEmail: req.user.email,
      },
    } as unknown as Parameters<Parameters<typeof emit>[0]>)

    return {
      status: 200,
      body: {
        success: true,
        message: 'Member removed successfully',
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Remove member error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to remove member' },
    }
  }
}
