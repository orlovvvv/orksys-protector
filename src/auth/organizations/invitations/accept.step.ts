import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'

const bodySchema = z.object({
  invitationId: z.string(),
})

// Type for Better Auth acceptInvitation response
type MemberData = {
  id: string
  organizationId: string
  userId: string
  role: string
  createdAt: string | Date
}

type OrganizationData = {
  id: string
  name: string
  slug: string
}

type AcceptInvitationResult = {
  member: MemberData
  organization: OrganizationData
}

export const config: ApiRouteConfig = {
  name: 'AcceptInvitation',
  type: 'api',
  path: '/organizations/invitations/accept',
  method: 'POST',
  description: 'Accept an invitation to join an organization',
  emits: ['organization.invitation.accepted'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware],
  bodySchema,
  responseSchema: {
    200: z.object({
      member: z.object({
        id: z.string(),
        organizationId: z.string(),
        userId: z.string(),
        role: z.string(),
        createdAt: z.string(),
      }),
      organization: z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
      }),
    }),
    400: z.object({
      error: z.string(),
    }),
    401: z.object({
      error: z.string(),
    }),
    404: z.object({
      error: z.string(),
    }),
  },
}

export const handler: Handlers['AcceptInvitation'] = async (req, { emit, logger }) => {
  try {
    const { invitationId } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Accept invitation request received', {
      userId: req.user.id,
      invitationId,
    })

    // Call Better Auth's acceptInvitation endpoint
    // Better Auth returns the member and organization data directly, or throws an error
    let data: AcceptInvitationResult
    try {
      data = await auth.api.acceptInvitation({
        body: {
          invitationId,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as AcceptInvitationResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to accept invitation', {
        error: error.message || 'Unknown error',
        invitationId,
      })

      const errorMessage = error.message?.toLowerCase() || ''
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist') || errorMessage.includes('invalid')) {
        return {
          status: 404,
          body: { error: 'Invitation not found or invalid' },
        }
      }
      if (errorMessage.includes('expired')) {
        return {
          status: 400,
          body: { error: 'Invitation has expired' },
        }
      }
      if (errorMessage.includes('email') || errorMessage.includes('does not match')) {
        return {
          status: 400,
          body: { error: 'Invitation email does not match your email' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Failed to accept invitation' },
      }
    }

    logger.info('Invitation accepted successfully', {
      invitationId,
      userId: req.user.id,
      organizationId: data.organization?.id,
    })

    // Emit event for audit logging
    await emit({
      topic: 'organization.invitation.accepted',
      data: {
        __topic: 'organization.invitation.accepted',
        invitationId,
        organizationId: data.organization?.id || '',
        userId: req.user.id,
        acceptedAt: new Date().toISOString(),
      },
    })

    return {
      status: 200,
      body: {
        member: {
          id: data.member?.id || '',
          organizationId: data.member?.organizationId || '',
          userId: data.member?.userId || '',
          role: data.member?.role || 'member',
          createdAt: new Date(data.member?.createdAt || new Date()).toISOString(),
        },
        organization: {
          id: data.organization?.id || '',
          name: data.organization?.name || '',
          slug: data.organization?.slug || '',
        },
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Accept invitation error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to accept invitation' },
    }
  }
}
