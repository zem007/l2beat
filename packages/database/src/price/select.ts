import { Price } from '../kysely/generated/types'

export const selectPrice = [
  'configuration_id',
  'price_usd',
  'timestamp',
] as const satisfies (keyof Price)[]
