import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../middleware/error-handler.middleware'
import { authMiddleware } from '../middleware/auth.middleware'

const bodySchema = z.object({
  organizationId: z.string(),
})

// Type for Better Auth setActiveOrganization response
type SetActiveOrganizationResult = {
  activeOrganizationId: string
}

export const config: ApiRouteConfig = {
  name: 'SetActiveOrganization',
  type: 'api',
  path: '/organizations/active',
  method: 'POST',
  description: 'Set the active organization for the current session',
  emits: ['organization.active.changed'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      success: z.boolean(),
      activeOrganizationId: z.string(),
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

export const handler: Handlers['SetActiveOrganization'] = async (req, { emit, logger }) => {
  try {
    const { organizationId } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Set active organization request received', {
      userId: req.user.id,
      organizationId,
    })

    // Call Better Auth's setActiveOrganization endpoint
    // Better Auth returns the active organization ID directly, or throws an error
    let data: SetActiveOrganizationResult
    try {
      data = await auth.api.setActiveOrganization({
        body: {
          organizationId,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as SetActiveOrganizationResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to set active organization', {
        error: error.message || 'Unknown error',
        organizationId,
      })

      const errorMessage = error.message?.toLowerCase() || ''
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist') || errorMessage.includes('not a member')) {
        return {
          status: 403,
          body: { error: 'You are not a member of this organization' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Failed to set active organization' },
      }
    }

    logger.info('Active organization set successfully', {
      userId: req.user.id,
      organizationId: data.activeOrganizationId,
    })

    // Emit event for audit logging
    await emit({
      topic: 'organization.active.changed',
      data: {
        __topic: 'organization.active.changed',
        userId: req.user.id,
        userEmail: req.user.email,
        organizationId: data.activeOrganizationId,
      },
    })

    return {
      status: 200,
      body: {
        success: true,
        activeOrganizationId: data.activeOrganizationId,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Set active organization error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to set active organization' },
    }
  }
}
