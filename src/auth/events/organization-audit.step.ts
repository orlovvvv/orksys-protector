import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'

// Simple flexible schema for all organization audit events
// Using a single object schema with optional fields for Motia compatibility
const inputSchema = z.object({
  __topic: z.string(),
  organizationId: z.string(),
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
  role: z.string().optional(),
  addedByUserId: z.string().optional(),
  addedByUserEmail: z.string().optional(),
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
  input: inputSchema,
  flows: ['organization-management'],
}

export const handler: Handlers['OrganizationAuditLogger'] = async (input, { logger }) => {
  try {
    const { __topic } = input

    logger.info('Organization audit log', {
      topic: __topic,
      data: input,
      timestamp: new Date().toISOString(),
    })

    // Log specific event based on topic
    switch (__topic) {
      case 'organization.created':
        logger.info('AUDIT: Organization created', {
          organizationId: input.organizationId,
          organizationName: input.organizationName,
          createdByUserId: input.userId,
          createdByUserEmail: input.userEmail,
        })
        break

      case 'organization.updated':
        logger.info('AUDIT: Organization updated', {
          organizationId: input.organizationId,
          updatedByUserId: input.userId,
          updatedByUserEmail: input.userEmail,
          updatedFields: input.updatedFields,
        })
        break

      case 'organization.deleted':
        logger.info('AUDIT: Organization deleted', {
          organizationId: input.organizationId,
          deletedByUserId: input.userId,
          deletedByUserEmail: input.userEmail,
        })
        break

      case 'organization.member.added':
        logger.info('AUDIT: Member added to organization', {
          organizationId: input.organizationId,
          memberId: input.memberId,
          addedUserId: input.addedUserId,
          addedUserEmail: input.addedUserEmail,
          role: input.role,
          addedByUserId: input.addedByUserId,
          addedByUserEmail: input.addedByUserEmail,
        })
        break

      case 'organization.member.removed':
        logger.info('AUDIT: Member removed from organization', {
          organizationId: input.organizationId,
          memberId: input.memberId,
          removedByUserId: input.removedByUserId,
          removedByUserEmail: input.removedByUserEmail,
        })
        break

      case 'organization.member.roleUpdated':
        logger.info('AUDIT: Member role updated', {
          organizationId: input.organizationId,
          memberId: input.memberId,
          newRole: input.newRole,
          updatedByUserId: input.updatedByUserId,
          updatedByUserEmail: input.updatedByUserEmail,
        })
        break

      case 'organization.member.left':
        logger.info('AUDIT: Member left organization', {
          organizationId: input.organizationId,
          userId: input.userId,
          userEmail: input.userEmail,
        })
        break

      case 'organization.active.changed':
        logger.info('AUDIT: Active organization changed', {
          userId: input.userId,
          userEmail: input.userEmail,
          organizationId: input.organizationId,
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
