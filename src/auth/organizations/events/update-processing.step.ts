import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  organizationId: z.string(),
  name: z.string().optional(),
  slug: z.string().optional(),
  logo: z.string().nullish().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  authorization: z.string(),
  userId: z.string(),
  userEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessUpdateOrganization',
  type: 'event',
  description: 'Process organization update in the background',
  subscribes: ['organization.update.requested'],
  emits: ['organization.updated', 'organization.update.failed'],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['ProcessUpdateOrganization'] = async (
  input,
  { emit, logger, state },
) => {
  const {
    requestId,
    organizationId,
    name,
    slug,
    logo,
    metadata,
    authorization,
    userId,
    userEmail,
  } = input

  const updates: Record<string, unknown> = { organizationId }
  if (name !== undefined) updates.name = name
  if (slug !== undefined) updates.slug = slug
  if (logo !== undefined) updates.logo = logo
  if (metadata !== undefined) updates.metadata = metadata

  logger.info('Processing organization update', {
    requestId,
    organizationId,
    userId,
    updatedFields: Object.keys(updates).filter((k) => k !== 'organizationId'),
  })

  try {
    // Call Better Auth's updateOrganization endpoint
    const orgData = await auth.api.updateOrganization({
      body: updates,
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    }) as {
      id: string
      name: string
      slug: string
      logo: string | null
      createdAt: Date
    }

    logger.info('Organization updated successfully', {
      requestId,
      organizationId,
      userId,
    })

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
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'organization.updated',
      data: {
        __topic: 'organization.updated',
        organizationId,
        organizationName: orgData.name,
        userId,
        userEmail,
        updatedFields: Object.keys(updates).filter((k) => k !== 'organizationId'),
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Organization update failed', {
      requestId,
      organizationId,
      error: errorMessage,
      userId,
    })

    // Determine status code from error
    let statusCode = 400
    const errorMsgLower = errorMessage.toLowerCase()
    if (errorMsgLower.includes('not found') || errorMsgLower.includes('does not exist')) {
      statusCode = 404
    } else if (errorMsgLower.includes('slug') || errorMsgLower.includes('exists') || errorMsgLower.includes('duplicate')) {
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
      topic: 'organization.update.failed',
      data: {
        __topic: 'organization.update.failed',
        requestId,
        organizationId,
        userId,
        userEmail,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
