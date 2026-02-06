import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { organizationMiddleware, organizationAdminMiddleware } from '../../middleware/organization.middleware'

const bodySchema = z.object({
  invitationId: z.string(),
})

// Type for Better Auth cancelInvitation response
type CancelInvitationResult = {
  success: boolean
}

export const config: ApiRouteConfig = {
  name: 'CancelInvitation',
  type: 'api',
  path: '/organizations/:orgId/invitations/cancel',
  method: 'POST',
  description: 'Cancel a pending invitation',
  emits: ['organization.invitation.canceled'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationAdminMiddleware],
  bodySchema,
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
  },
}

export const handler: Handlers['CancelInvitation'] = async (req, { emit, logger }) => {
  try {
    const orgId = req.pathParams?.orgId as string
    const { invitationId } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Cancel invitation request received', {
      userId: req.user.id,
      organizationId: orgId,
      invitationId,
    })

    // Call Better Auth's cancelInvitation endpoint
    // Better Auth returns success/failure directly, or throws an error
    try {
      await auth.api.cancelInvitation({
        body: {
          invitationId,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as CancelInvitationResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to cancel invitation', {
        error: error.message || 'Unknown error',
        invitationId,
      })

      const errorMessage = error.message?.toLowerCase() || ''
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return {
          status: 404,
          body: { error: 'Invitation not found' },
        }
      }
      if (errorMessage.includes('already') || errorMessage.includes('accepted') || errorMessage.includes('rejected')) {
        return {
          status: 400,
          body: { error: 'Invitation is no longer pending' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Failed to cancel invitation' },
      }
    }

    logger.info('Invitation canceled successfully', {
      invitationId,
      userId: req.user.id,
    })

    // Emit event for audit logging
    await emit({
      topic: 'organization.invitation.canceled',
      data: {
        invitationId,
        organizationId: orgId,
        canceledByUserId: req.user.id,
        canceledByUserEmail: req.user.email,
      },
    })

    return {
      status: 200,
      body: {
        success: true,
        message: 'Invitation canceled successfully',
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Cancel invitation error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to cancel invitation' },
    }
  }
}
