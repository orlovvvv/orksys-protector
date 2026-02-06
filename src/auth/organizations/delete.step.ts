import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'
import { organizationMiddleware, organizationOwnerMiddleware } from '../middleware/organization.middleware'

// Type for Better Auth deleteOrganization response
type DeleteOrganizationResult = {
  success: boolean
}

export const config: ApiRouteConfig = {
  name: 'DeleteOrganization',
  type: 'api',
  path: '/organizations/:orgId',
  method: 'DELETE',
  description: 'Delete an organization (owner only)',
  emits: ['organization.deleted'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationOwnerMiddleware],
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

export const handler: Handlers['DeleteOrganization'] = async (req, { emit, logger }) => {
  try {
    const orgId = req.pathParams?.orgId as string

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Organization deletion request received', {
      userId: req.user.id,
      organizationId: orgId,
    })

    // Call Better Auth's deleteOrganization endpoint
    // Better Auth returns success/failure directly, or throws an error
    try {
      await auth.api.deleteOrganization({
        body: {
          organizationId: orgId,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as DeleteOrganizationResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Organization deletion failed', {
        error: error.message || 'Unknown error',
        organizationId: orgId,
      })

      const errorMessage = error.message?.toLowerCase() || ''
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return {
          status: 404,
          body: { error: 'Organization not found' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Organization deletion failed' },
      }
    }

    logger.info('Organization deleted successfully', {
      organizationId: orgId,
      userId: req.user.id,
    })

    // Emit event for audit logging
    await emit({
      topic: 'organization.deleted',
      data: {
        organizationId: orgId,
        userId: req.user.id,
        userEmail: req.user.email,
      },
    })

    return {
      status: 200,
      body: {
        success: true,
        message: 'Organization deleted successfully',
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Organization deletion error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Organization deletion failed' },
    }
  }
}
