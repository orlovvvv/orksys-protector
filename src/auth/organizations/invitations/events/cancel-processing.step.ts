import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  organizationId: z.string(),
  invitationId: z.string(),
  authorization: z.string(),
  userId: z.string(),
  userEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessCancelInvitation',
  type: 'event',
  description: 'Process canceling organization invitation in the background',
  subscribes: ['organization.invitation.cancel.requested'],
  emits: ['organization.invitation.canceled', 'organization.invitation.cancel.failed'],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['ProcessCancelInvitation'] = async (
  input,
  { emit, logger, state },
) => {
  const { requestId, organizationId, invitationId, authorization, userId, userEmail } =
    input

  logger.info('Processing cancel invitation', {
    requestId,
    organizationId,
    invitationId,
  })

  try {
    // Call Better Auth's cancelInvitation endpoint
    await auth.api.cancelInvitation({
      body: {
        invitationId,
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    })

    logger.info('Invitation canceled successfully', {
      requestId,
      invitationId,
      userId,
    })

    // Store result in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'completed',
      data: {
        success: true,
        message: 'Invitation canceled successfully',
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'organization.invitation.canceled',
      data: {
        __topic: 'organization.invitation.canceled',
        invitationId,
        organizationId,
        canceledAt: new Date().toISOString(),
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to cancel invitation', {
      requestId,
      invitationId,
      error: errorMessage,
    })

    // Determine status code from error
    let statusCode = 400
    let userMessage = errorMessage
    const errorMsgLower = errorMessage.toLowerCase()
    if (errorMsgLower.includes('not found') || errorMsgLower.includes('does not exist')) {
      statusCode = 404
      userMessage = 'Invitation not found'
    } else if (
      errorMsgLower.includes('already') ||
      errorMsgLower.includes('accepted') ||
      errorMsgLower.includes('rejected')
    ) {
      userMessage = 'Invitation is no longer pending'
    }

    // Store error in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'failed',
      error: userMessage,
      statusCode,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'organization.invitation.cancel.failed',
      data: {
        __topic: 'organization.invitation.cancel.failed',
        requestId,
        organizationId,
        invitationId,
        userId,
        userEmail,
        error: userMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
