import { isEmpty } from 'lodash'
import { z } from 'zod'

export const ValueType = z.enum([
  'CODE_CHANGE',
  'L2',
  'EXTERNAL',
  'RISK_PARAMETER',
  'PERMISSION',
])

export function isEmptyValueMeta(value: ValueMeta): boolean {
  return (
    isEmpty(value) ||
    (value.description === null &&
      value.severity === null &&
      value.type === null)
  )
}

export type ValueMeta = z.infer<typeof ValueMeta>
export const ValueMeta = z
  .object({
    description: z.string().nullable().optional(),
    targetContractDescription: z.string().optional(),
    severity: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable().optional(),
    type: z
      .union([ValueType, z.array(ValueType)])
      .nullable()
      .optional(),
  })
  .strict()

export type ContractMeta = z.infer<typeof ContractMeta>
export const ContractMeta = z
  .object({
    ['$schema']: z.string().optional(),
    name: z.string(),
    extends: z.string().optional(),
    description: z.string().optional(),
    values: z.record(z.string(), ValueMeta).optional(),
  })
  .strict()

export type DiscoveryMeta = z.infer<typeof DiscoveryMeta>
export const DiscoveryMeta = z
  .object({
    ['$schema']: z.string().optional(),
    contracts: z.array(ContractMeta),
    _templatesWereInlined: z.boolean().optional(),
  })
  .strict()
