import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './user'

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
  // Admin plugin fields
  impersonatedBy: text('impersonatedBy'),
  // Organization plugin fields
  activeOrganizationId: text('activeOrganizationId'),
})

export type Session = typeof session.$inferSelect
export type NewSession = typeof session.$inferInsert
