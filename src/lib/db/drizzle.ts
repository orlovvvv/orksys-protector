import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as userSchema from './schema/user'
import * as sessionSchema from './schema/session'
import * as accountSchema from './schema/account'
import * as verificationSchema from './schema/verification'
import * as apiKeySchema from './schema/api-key'
import * as organizationSchema from './schema/organization'

const connectionString = process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/orksys_protector'

const client = postgres(connectionString)

export const db = drizzle(client, {
  schema: {
    ...userSchema,
    ...sessionSchema,
    ...accountSchema,
    ...verificationSchema,
    ...apiKeySchema,
    ...organizationSchema,
  },
})

export * from './schema/user'
export * from './schema/session'
export * from './schema/account'
export * from './schema/verification'
export * from './schema/api-key'
export * from './schema/organization'
