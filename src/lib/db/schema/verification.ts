import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './user'

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  userId: text('userId').references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
})

export type Verification = typeof verification.$inferSelect
export type NewVerification = typeof verification.$inferInsert
