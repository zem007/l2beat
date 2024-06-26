import { createRepositories } from '@l2beat/database'
import { env } from '~/env'

export const db = createRepositories({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
