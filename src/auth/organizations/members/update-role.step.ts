import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { organizationMiddleware, organizationOwnerMiddleware } from '../../middleware/organization.middleware'

const bodySchema = z.object({
  role: z.enum(['owner', 'admin', 'member'], {
    message: 'Role must be one of: owner, admin, member',
  }),
})

// Type for Better Auth updateMemberRole response
type MemberData = {
  id: string
  organizationId: string
  userId: string
  role: string
  createdAt: string | Date
}

type UpdateMemberRoleResult = MemberData

export const config: ApiRouteConfig = {
  name: 'UpdateMemberRole',
  type: 'api',
  path: '/organizations/:orgId/members/:memberId/role',
  method: 'PATCH',
  description: 'Update a member role in an organization (owner only)',
  emits: ['organization.member.roleUpdated'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationOwnerMiddleware],
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

export const handler: Handlers['UpdateMemberRole'] = async (req, { emit, logger }) => {
  try {
    const orgId = req.pathParams?.orgId as string
    const memberId = req.pathParams?.memberId as string
    const { role } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Update member role request received', {
      userId: req.user.id,
      organizationId: orgId,
      memberId,
      newRole: role,
    })

    // Call Better Auth's updateMemberRole endpoint
    // Better Auth returns the updated member data directly, or throws an error
    let memberData: MemberData
    try {
      memberData = await auth.api.updateMemberRole({
        body: {
          organizationId: orgId,
          userIdOrMemberId: memberId,
          role,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as UpdateMemberRoleResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to update member role', {
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
      if (errorMessage.includes('owner') || errorMessage.includes('last owner')) {
        return {
          status: 400,
          body: { error: 'Cannot change the owner role or there must be at least one owner' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Failed to update member role' },
      }
    }

    logger.info('Member role updated successfully', {
      organizationId: orgId,
      userId: req.user.id,
      memberId,
      newRole: role,
    })

    // Emit event for audit logging
    await emit({
      topic: 'organization.member.roleUpdated',
      data: {
        organizationId: orgId,
        memberId,
        newRole: role,
        updatedByUserId: req.user.id,
        updatedByUserEmail: req.user.email,
      },
    })

    return {
      status: 200,
      body: {
        member: {
          id: memberData.id,
          organizationId: memberData.organizationId,
          userId: memberData.userId,
          role: memberData.role,
          createdAt: new Date(memberData.createdAt).toISOString(),
        },
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Update member role error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to update member role' },
    }
  }
}
