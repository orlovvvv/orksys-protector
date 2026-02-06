import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { organizationMiddleware } from '../../middleware/organization.middleware'

// Type for Better Auth listInvitations response
type InvitationItem = {
  id: string
  organizationId: string
  email: string
  role: string
  status: string
  expiresAt: string | Date
  createdAt: string | Date
  inviterId: string
}

type ListInvitationsResult = InvitationItem[]

export const config: ApiRouteConfig = {
  name: 'ListInvitations',
  type: 'api',
  path: '/organizations/:orgId/invitations',
  method: 'GET',
  description: 'List invitations for an organization',
  emits: [],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware],
  responseSchema: {
    200: z.object({
      invitations: z.array(z.object({
        id: z.string(),
        organizationId: z.string(),
        email: z.string(),
        role: z.string(),
        status: z.string(),
        expiresAt: z.string(),
        createdAt: z.string(),
        inviterId: z.string(),
      })),
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
  },
}

export const handler: Handlers['ListInvitations'] = async (req, { logger }) => {
  try {
    const orgId = req.pathParams?.orgId as string

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('List invitations request received', {
      userId: req.user.id,
      organizationId: orgId,
    })

    // Call Better Auth's listInvitations endpoint
    // Better Auth returns an array directly, or throws an error
    let invitations: ListInvitationsResult
    try {
      invitations = await auth.api.listInvitations({
        query: {
          organizationId: orgId,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as ListInvitationsResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to list invitations', {
        error: error.message || 'Unknown error',
        organizationId: orgId,
      })

      return {
        status: 400,
        body: { error: error.message || 'Failed to list invitations' },
      }
    }

    logger.info('Invitations listed successfully', {
      organizationId: orgId,
      count: invitations.length,
    })

    return {
      status: 200,
      body: {
        invitations: invitations.map((inv) => ({
          id: inv.id,
          organizationId: inv.organizationId,
          email: inv.email,
          role: inv.role,
          status: inv.status,
          expiresAt: new Date(inv.expiresAt).toISOString(),
          createdAt: new Date(inv.createdAt).toISOString(),
          inviterId: inv.inviterId,
        })),
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('List invitations error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to list invitations' },
    }
  }
}
