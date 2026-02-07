import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { auth } from '../../../../lib/better-auth/auth'

const inputSchema = z.object({
  requestId: z.string(),
  invitationId: z.string(),
  authorization: z.string(),
  userId: z.string(),
  userEmail: z.string(),
})

export const config: EventConfig = {
  name: 'ProcessAcceptInvitation',
  type: 'event',
  description: 'Process accepting organization invitation in the background',
  subscribes: ['organization.invitation.accept.requested'],
  emits: ['organization.invitation.accepted', 'organization.invitation.accept.failed'],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['ProcessAcceptInvitation'] = async (
  input,
  { emit, logger, state },
) => {
  const { requestId, invitationId, authorization, userId, userEmail } = input

  logger.info('Processing accept invitation', {
    requestId,
    invitationId,
    userId,
  })

  try {
    // Call Better Auth's acceptInvitation endpoint
    const response = await auth.api.acceptInvitation({
      body: {
        invitationId,
      },
      headers: authorization ? { authorization } : ({} as unknown as Headers),
    })

    // Better Auth returns { invitation, member } structure
    // We need to get the organization from the member or construct it
    const invitation = response?.invitation
    const member = response?.member
    const orgId = member?.organizationId || invitation?.organizationId || ''

    logger.info('Invitation accepted successfully', {
      requestId,
      invitationId,
      userId,
      organizationId: orgId,
    })

    // Store result in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'completed',
      data: {
        member: member ? {
          id: member.id,
          organizationId: member.organizationId,
          userId: member.userId,
          role: member.role,
          createdAt: new Date(member.createdAt).toISOString(),
        } : {
          id: '',
          organizationId: orgId,
          userId,
          role: 'member',
          createdAt: new Date().toISOString(),
        },
        organization: {
          id: orgId,
          name: '', // Better Auth doesn't return org name in acceptInvitation response
          slug: '',
        },
      },
    })

    // Emit success event for audit logging
    await emit({
      topic: 'organization.invitation.accepted',
      data: {
        __topic: 'organization.invitation.accepted',
        invitationId,
        organizationId: orgId,
        userId,
        acceptedAt: new Date().toISOString(),
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    const errorMessage = err.message || 'Unknown error'

    logger.error('Failed to accept invitation', {
      requestId,
      invitationId,
      error: errorMessage,
    })

    // Determine status code from error
    let statusCode = 400
    let userMessage = errorMessage
    const errorMsgLower = errorMessage.toLowerCase()
    if (
      errorMsgLower.includes('not found') ||
      errorMsgLower.includes('does not exist') ||
      errorMsgLower.includes('invalid')
    ) {
      statusCode = 404
      userMessage = 'Invitation not found or invalid'
    } else if (errorMsgLower.includes('expired')) {
      userMessage = 'Invitation has expired'
    } else if (errorMsgLower.includes('email') || errorMsgLower.includes('does not match')) {
      userMessage = 'Invitation email does not match your email'
    }

    // Store error in state for the API gateway to retrieve
    await state.set('org-requests', requestId, {
      status: 'failed',
      error: userMessage,
      statusCode,
    })

    // Emit failed event for audit logging
    await emit({
      topic: 'organization.invitation.accept.failed',
      data: {
        __topic: 'organization.invitation.accept.failed',
        requestId,
        invitationId,
        userId,
        userEmail,
        error: userMessage,
        timestamp: new Date().toISOString(),
      },
    })
  }
}
