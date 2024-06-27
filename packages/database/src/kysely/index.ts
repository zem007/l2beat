import {
  Kysely,
  Transaction as KyselyTransaction,
  PostgresDialect,
} from 'kysely'
import { Pool, PoolConfig, types } from 'pg'
import { DB } from './generated/types'

types.setTypeParser(1114, function (stringValue) {
  return new Date(stringValue + '+0000')
})

export class PostgresDatabase extends Kysely<DB> {
  constructor(config?: PoolConfig) {
    super({
      dialect: new PostgresDialect({
        pool: new Pool({
          ...config,
          types,
        }),
      }),
    })
  }
}

export type Transaction = KyselyTransaction<DB>
