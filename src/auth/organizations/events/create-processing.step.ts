import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullish(),
  authorization: z.string(),
  userId: z.string(),
  userEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessCreateOrganization',
  type: 'event',
  description: 'Process organization creation in the background',
  subscribes: ['organization.create.requested'],
  emits: ['organization.created', 'organization.create.failed'],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['ProcessCreateOrganization'] = async (
  input,
  { emit, logger, state },
) => {
  const { requestId, name, slug, logo, authorization, userId, userEmail } = input

  logger.info('Processing organization creation', {
    requestId,
    userId,
    name,
    slug,
  })

  try {
    // Call Better Auth's createOrganization endpoint
    // Only include logo if it's provided
    const body: { name: string; slug: string; logo?: string } = { name, slug }
    if (logo !== null && logo !== undefined) {
      body.logo = logo
    }

    const orgData = await auth.api.createOrganization({
      body,
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    }) as {
      id: string
      name: string
      slug: string
      logo: string | null
      createdAt: Date
      members: Array<{ id: string; organizationId: string; userId: string; role: string; createdAt: Date }>
    }

    logger.info('Organization created successfully', {
      requestId,
      organizationId: orgData.id,
      userId,
    })

    // Find the member from the members array (Better Auth returns members array)
    const member = orgData.members?.find((m) => m.userId === userId)

    // Store result in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'completed',
      data: {
        organization: {
          id: orgData.id,
          name: orgData.name,
          slug: orgData.slug,
          logo: orgData.logo ?? null,
          createdAt: new Date(orgData.createdAt).toISOString(),
        },
        member: member
          ? {
              id: member.id,
              organizationId: member.organizationId,
              userId: member.userId,
              role: member.role,
              createdAt: new Date(member.createdAt).toISOString(),
            }
          : null,
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'organization.created',
      data: {
        __topic: 'organization.created',
        organizationId: orgData.id,
        organizationName: orgData.name,
        userId,
        userEmail,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string; statusCode?: number }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Organization creation failed', {
      requestId,
      error: errorMessage,
      userId,
    })

    // Determine status code from error
    let statusCode = 400
    const errorMsgLower = errorMessage.toLowerCase()
    if (errorMsgLower.includes('slug') || errorMsgLower.includes('exists') || errorMsgLower.includes('duplicate')) {
      statusCode = 409
    }

    // Store error in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'failed',
      error: errorMessage,
      statusCode,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'organization.create.failed',
      data: {
        __topic: 'organization.create.failed',
        requestId,
        name,
        slug,
        userId,
        userEmail,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
