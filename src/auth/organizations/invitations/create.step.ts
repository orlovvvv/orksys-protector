import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { organizationMiddleware, organizationAdminMiddleware } from '../../middleware/organization.middleware'

const bodySchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['owner', 'admin', 'member'], {
    message: 'Role must be one of: owner, admin, member',
  }),
  expiresIn: z.number().optional().default(7 * 24 * 60 * 60), // 7 days default
})

// Type for Better Auth createInvitation response
type InvitationData = {
  id: string
  organizationId: string
  email: string
  role: string
  status: string
  expiresAt: string | Date
  createdAt: string | Date
  inviterId: string
}

export const config: ApiRouteConfig = {
  name: 'CreateInvitation',
  type: 'api',
  path: '/organizations/:orgId/invitations',
  method: 'POST',
  description: 'Create an invitation to join an organization',
  emits: ['organization.invitation.created'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationAdminMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      invitation: z.object({
        id: z.string(),
        organizationId: z.string(),
        email: z.string(),
        role: z.string(),
        status: z.string(),
        expiresAt: z.string(),
        createdAt: z.string(),
      }),
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

export const handler: Handlers['CreateInvitation'] = async (req, { emit, logger }) => {
  try {
    const orgId = req.pathParams?.orgId as string
    const { email, role, expiresIn } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Create invitation request received', {
      userId: req.user.id,
      organizationId: orgId,
      email,
      role,
    })

    // Calculate expiresAt
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    // Call Better Auth's createInvitation endpoint
    // Better Auth returns the invitation data directly, or throws an error
    let invitationData: InvitationData
    try {
      invitationData = await auth.api.createInvitation({
        body: {
          organizationId: orgId,
          email,
          role,
          expiresAt: expiresAt.toISOString(),
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as InvitationData
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to create invitation', {
        error: error.message || 'Unknown error',
        organizationId: orgId,
        email,
      })

      return {
        status: 400,
        body: { error: error.message || 'Failed to create invitation' },
      }
    }

    logger.info('Invitation created successfully', {
      organizationId: orgId,
      invitationId: invitationData.id,
      email,
    })

    // Emit event for sending invitation email
    await emit({
      topic: 'organization.invitation.created',
      data: {
        __topic: 'organization.invitation.created',
        organizationId: orgId,
        invitationId: invitationData.id,
        email,
        role,
        createdAt: new Date(invitationData.createdAt).toISOString(),
      },
    })

    return {
      status: 200,
      body: {
        invitation: {
          id: invitationData.id,
          organizationId: invitationData.organizationId,
          email: invitationData.email,
          role: invitationData.role,
          status: invitationData.status,
          expiresAt: new Date(invitationData.expiresAt).toISOString(),
          createdAt: new Date(invitationData.createdAt).toISOString(),
        },
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Create invitation error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to create invitation' },
    }
  }
}
