import type { ApiRouteConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'
import { db } from '../../../lib/db/drizzle'
import { user } from '../../../lib/db/drizzle'
import { eq } from 'drizzle-orm'
import { errorHandlerMiddleware } from '../../middleware/error-handler.middleware'
import { authMiddleware } from '../../middleware/auth.middleware'
import { organizationMiddleware, organizationAdminMiddleware } from '../../middleware/organization.middleware'

const bodySchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['owner', 'admin', 'member'], {
    message: 'Role must be one of: owner, admin, member',
  }),
})

// Type for Better Auth addMember response
type MemberData = {
  id: string
  organizationId: string
  userId: string
  role: string
  createdAt: string | Date
}

type AddMemberResult = MemberData

export const config: ApiRouteConfig = {
  name: 'AddOrganizationMember',
  type: 'api',
  path: '/organizations/:orgId/members',
  method: 'POST',
  description: 'Add a member to an organization',
  emits: ['organization.member.added'],
  flows: ['organization-management'],
  middleware: [errorHandlerMiddleware, authMiddleware, organizationMiddleware, organizationAdminMiddleware],
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

export const handler: Handlers['AddOrganizationMember'] = async (req, { emit, logger }) => {
  try {
    const orgId = req.pathParams?.orgId as string
    const { email, role } = bodySchema.parse(req.body)

    if (!req.user) {
      return {
        status: 401,
        body: { error: 'Unauthorized' },
      }
    }

    logger.info('Add member request received', {
      userId: req.user.id,
      organizationId: orgId,
      email,
      role,
    })

    // Find the user by email
    const users = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1)

    if (!users || users.length === 0) {
      logger.warn('User not found for adding to organization', {
        email,
        organizationId: orgId,
      })

      return {
        status: 404,
        body: { error: 'User not found. User must register first before being added to an organization.' },
      }
    }

    const targetUser = users[0]

    // Call Better Auth's addMember endpoint
    // Better Auth returns the member data directly, or throws an error
    let memberData: MemberData
    try {
      memberData = await auth.api.addMember({
        body: {
          organizationId: orgId,
          userId: targetUser.id,
          role,
        },
        // Type assertion: Better Auth expects HeadersInit, our middleware provides a compatible object
        headers: req.headers['authorization']
          ? { authorization: req.headers['authorization'] as string }
          : {} as unknown as Headers,
      }) as AddMemberResult
    } catch (betterAuthError: unknown) {
      // Better Auth throws errors, we convert them to our response format
      const error = betterAuthError as { message?: string }
      logger.error('Failed to add member', {
        error: error.message || 'Unknown error',
        organizationId: orgId,
        targetUserId: targetUser.id,
      })

      const errorMessage = error.message?.toLowerCase() || ''
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return {
          status: 404,
          body: { error: 'Organization or user not found' },
        }
      }
      if (errorMessage.includes('already') || errorMessage.includes('exists')) {
        return {
          status: 400,
          body: { error: 'User is already a member of this organization' },
        }
      }

      return {
        status: 400,
        body: { error: error.message || 'Failed to add member' },
      }
    }

    logger.info('Member added successfully', {
      organizationId: orgId,
      userId: req.user.id,
      targetUserId: targetUser.id,
      role,
    })

    // Emit event for audit logging
    await emit({
      topic: 'organization.member.added',
      data: {
        organizationId: orgId,
        memberId: memberData.id,
        addedUserId: targetUser.id,
        addedUserEmail: targetUser.email,
        role,
        addedByUserId: req.user.id,
        addedByUserEmail: req.user.email,
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
    logger.error('Add member error', {
      error: message,
      userId: req.user?.id,
    })

    return {
      status: 500,
      body: { error: 'Failed to add member' },
    }
  }
}
