import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

// Simple flexible schema for invitation audit events
// Using a record schema for better Motia compatibility
const inputSchema = z.object({
  __topic: z.string(),
  invitationId: z.string(),
  organizationId: z.string(),
  email: z.string().optional(),
  role: z.string().optional(),
  createdAt: z.string().optional(),
  acceptedAt: z.string().optional(),
  canceledAt: z.string().optional(),
  userId: z.string().optional(),
})

export const config: EventConfig = {
  name: 'AuditInvitationEvents',
  type: 'event',
  description: 'Log invitation events to audit log',
  subscribes: [
    'organization.invitation.created',
    'organization.invitation.accepted',
    'organization.invitation.canceled',
  ],
  emits: [],
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['AuditInvitationEvents'] = async (input, { logger, state }) => {
  const { __topic, invitationId, organizationId } = input

  logger.info('Invitation audit log', {
    topic: __topic,
    invitationId,
    organizationId,
    data: input,
    timestamp: new Date().toISOString(),
  })

  // Store audit record based on event type
  if (__topic === 'organization.invitation.created' && input.createdAt) {
    await state.set('invitation-audit', invitationId, {
      action: 'created',
      organizationId,
      email: input.email,
      role: input.role,
      createdAt: input.createdAt,
      auditLoggedAt: new Date().toISOString(),
    })
  } else if (__topic === 'organization.invitation.accepted' && input.acceptedAt) {
    await state.set('invitation-audit', `${invitationId}:accepted`, {
      action: 'accepted',
      organizationId,
      userId: input.userId,
      acceptedAt: input.acceptedAt,
      auditLoggedAt: new Date().toISOString(),
    })
  } else if (__topic === 'organization.invitation.canceled' && input.canceledAt) {
    await state.set('invitation-audit', `${invitationId}:canceled`, {
      action: 'canceled',
      organizationId,
      canceledAt: input.canceledAt,
      auditLoggedAt: new Date().toISOString(),
    })
  }

  // TODO: Write to persistent audit log database/table
}
