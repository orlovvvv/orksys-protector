import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

// Input schema for organization audit events
// This captures the common fields across all organization events
const inputSchema = z.object({
  __topic: z.string(),
  organizationId: z.string().optional(),
  organizationName: z.string().optional(),
  userId: z.string().optional(),
  userEmail: z.string().optional(),
  memberId: z.string().optional(),
  addedUserId: z.string().optional(),
  addedUserEmail: z.string().optional(),
  removedByUserId: z.string().optional(),
  removedByUserEmail: z.string().optional(),
  newRole: z.string().optional(),
  updatedByUserId: z.string().optional(),
  updatedByUserEmail: z.string().optional(),
  updatedFields: z.array(z.string()).optional(),
})

export const config: EventConfig = {
  name: 'OrganizationAuditLogger',
  type: 'event',
  description: 'Audit logger for organization operations',
  subscribes: [
    'organization.created',
    'organization.updated',
    'organization.deleted',
    'organization.member.added',
    'organization.member.removed',
    'organization.member.roleUpdated',
    'organization.member.left',
    'organization.active.changed',
  ],
  emits: [],
  flows: ['organization-management'],
}

export const handler: Handlers['OrganizationAuditLogger'] = async (input, { logger }) => {
  try {
    const topic = (input as { __topic?: string }).__topic as string

    logger.info('Organization audit log', {
      topic,
      data: input,
      timestamp: new Date().toISOString(),
    })

    // Here you would typically write to an audit log table or external service
    // For now, we just log the event
    switch (topic) {
      case 'organization.created':
        logger.info('AUDIT: Organization created', {
          organizationId: (input as { organizationId: string }).organizationId,
          organizationName: (input as { organizationName?: string }).organizationName,
          createdByUserId: (input as { userId: string }).userId,
          createdByUserEmail: (input as { userEmail: string }).userEmail,
        })
        break

      case 'organization.updated':
        logger.info('AUDIT: Organization updated', {
          organizationId: (input as { organizationId: string }).organizationId,
          updatedByUserId: (input as { userId: string }).userId,
          updatedByUserEmail: (input as { userEmail: string }).userEmail,
        })
        break

      case 'organization.deleted':
        logger.info('AUDIT: Organization deleted', {
          organizationId: (input as { organizationId: string }).organizationId,
          deletedByUserId: (input as { userId: string }).userId,
          deletedByUserEmail: (input as { userEmail: string }).userEmail,
        })
        break

      case 'organization.member.added':
        logger.info('AUDIT: Member added to organization', {
          organizationId: (input as { organizationId: string }).organizationId,
          memberId: (input as { memberId: string }).memberId,
          addedUserId: (input as { addedUserId: string }).addedUserId,
          addedUserEmail: (input as { addedUserEmail: string }).addedUserEmail,
          role: (input as { role: string }).role,
          addedByUserId: (input as { addedByUserId: string }).addedByUserId,
          addedByUserEmail: (input as { addedByUserEmail: string }).addedByUserEmail,
        })
        break

      case 'organization.member.removed':
        logger.info('AUDIT: Member removed from organization', {
          organizationId: (input as { organizationId: string }).organizationId,
          memberId: (input as { memberId: string }).memberId,
          removedByUserId: (input as { removedByUserId: string }).removedByUserId,
          removedByUserEmail: (input as { removedByUserEmail: string }).removedByUserEmail,
        })
        break

      case 'organization.member.roleUpdated':
        logger.info('AUDIT: Member role updated', {
          organizationId: (input as { organizationId: string }).organizationId,
          memberId: (input as { memberId: string }).memberId,
          newRole: (input as { newRole: string }).newRole,
          updatedByUserId: (input as { updatedByUserId: string }).updatedByUserId,
          updatedByUserEmail: (input as { updatedByUserEmail: string }).updatedByUserEmail,
        })
        break

      case 'organization.member.left':
        logger.info('AUDIT: Member left organization', {
          organizationId: (input as { organizationId: string }).organizationId,
          userId: (input as { userId: string }).userId,
          userEmail: (input as { userEmail: string }).userEmail,
        })
        break

      case 'organization.active.changed':
        logger.info('AUDIT: Active organization changed', {
          userId: (input as { userId: string }).userId,
          userEmail: (input as { userEmail: string }).userEmail,
          organizationId: (input as { organizationId: string }).organizationId,
        })
        break
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Organization audit logger error', {
      error: message,
      input,
    })
  }
}
