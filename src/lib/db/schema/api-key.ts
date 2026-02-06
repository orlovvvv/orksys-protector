import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { user } from './user'

export const apiKey = pgTable('api_key', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  key: text('key').notNull().unique(),
  prefix: text('prefix').notNull(),
  permissions: jsonb('permissions').$type<Record<string, string[]>>(),
  expiresAt: timestamp('expiresAt'),
  lastRequest: timestamp('lastRequest'),
  requestCount: text('requestCount').notNull().default('0'),
  rateLimitTimeWindow: text('rateLimitTimeWindow'),
  rateLimitMaxRequests: text('rateLimitMaxRequests'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
})

export type ApiKey = typeof apiKey.$inferSelect
export type NewApiKey = typeof apiKey.$inferInsert
