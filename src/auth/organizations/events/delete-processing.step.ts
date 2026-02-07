import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  organizationId: z.string(),
  authorization: z.string(),
  userId: z.string(),
  userEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessDeleteOrganization',
  type: 'event',
  description: 'Process organization deletion in the background',
  subscribes: ['organization.delete.requested'],
  emits: ['organization.deleted', 'organization.delete.failed'],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['ProcessDeleteOrganization'] = async (
  input,
  { emit, logger, state },
) => {
  const { requestId, organizationId, authorization, userId, userEmail } = input

  logger.info('Processing organization deletion', {
    requestId,
    organizationId,
    userId,
  })

  try {
    // Call Better Auth's deleteOrganization endpoint
    await auth.api.deleteOrganization({
      body: {
        organizationId,
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    })

    logger.info('Organization deleted successfully', {
      requestId,
      organizationId,
      userId,
    })

    // Store result in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'completed',
      data: {
        success: true,
        message: 'Organization deleted successfully',
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'organization.deleted',
      data: {
        __topic: 'organization.deleted',
        organizationId,
        userId,
        userEmail,
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Organization deletion failed', {
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
    }

    // Store error in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'failed',
      error: errorMessage,
      statusCode,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'organization.delete.failed',
      data: {
        __topic: 'organization.delete.failed',
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
