import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

// Input schema for all invitation failed events
const inputSchema = z.object({
  __topic: z.string(),
  requestId: z.string(),
  error: z.string(),
  timestamp: z.string(),
  // Common fields
  userId: z.string().optional(),
  userEmail: z.string().optional(),
  // Invitation-specific fields
  organizationId: z.string().optional(),
  invitationId: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
})

export const config: EventConfig = {
  name: 'InvitationFailedLogger',
  type: 'event',
  description: 'Logs failed invitation operations for audit',
  subscribes: [
    'organization.invitation.create.failed',
    'organization.invitation.accept.failed',
    'organization.invitation.cancel.failed',
  ],
  emits: [],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['InvitationFailedLogger'] = async (input, { logger }) => {
  const {
    __topic,
    requestId,
    error,
    timestamp,
    userId,
    userEmail,
    organizationId,
    invitationId,
    email,
  } = input

  logger.warn('Invitation operation failed', {
    topic: __topic,
    requestId,
    error,
    userId,
    userEmail,
    organizationId,
    invitationId,
    email,
    timestamp,
  })

  // Log specific event based on topic
  switch (__topic) {
    case 'organization.invitation.create.failed':
      logger.warn('AUDIT: Failed to create invitation', {
        requestId,
        organizationId,
        email,
        role: input.role,
        userId,
        userEmail,
        error,
        timestamp,
      })
      break

    case 'organization.invitation.accept.failed':
      logger.warn('AUDIT: Failed to accept invitation', {
        requestId,
        invitationId,
        userId,
        userEmail,
        error,
        timestamp,
      })
      break

    case 'organization.invitation.cancel.failed':
      logger.warn('AUDIT: Failed to cancel invitation', {
        requestId,
        organizationId,
        invitationId,
        userId,
        userEmail,
        error,
        timestamp,
      })
      break
  }
}
