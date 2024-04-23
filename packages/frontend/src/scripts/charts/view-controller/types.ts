import { Milestone } from '@l2beat/config'
import { z } from 'zod'

import {
  ActivityResponse,
  AggregateDetailedTvlResponse,
  CostsResponse,
  TokenTvlResponse,
} from '../types'

export type ChartData =
  | ChartTvlData
  | ChartActivityData
  | ChartCostsData
  | ChartDetailedTvlData
  | ChartTokenTvlData

interface ChartTvlData {
  type: 'tvl'
  projectsData: [
    AggregateDetailedTvlResponse,
    ...AggregateDetailedTvlResponse[],
  ]
}

interface ChartActivityData {
  type: 'activity'
  projectsData: [ActivityResponse, ...ActivityResponse[]]
  isAggregate: boolean
}

interface ChartCostsData {
  type: 'costs'
  projectsData: [CostsResponse, ...CostsResponse[]]
}

interface ChartDetailedTvlData {
  type: 'detailed-tvl'
  projectData: AggregateDetailedTvlResponse
}

interface ChartTokenTvlData {
  type: 'token-tvl'
  tokenType: 'regular' | 'CBV' | 'EBV' | 'NMV'
  tokenSymbol: string
  projectData: TokenTvlResponse
}

export type ChartUnit = z.infer<typeof ChartUnit>
export const ChartUnit = z.union([
  z.literal('USD'),
  z.literal('ETH'),
  z.literal('GAS'),
])

export interface ChartControlsState {
  data?: ChartData
  timeRangeInDays: number
  unit: ChartUnit
  showEthereumTransactions?: boolean
  useLogScale: boolean
  milestones: Record<number, Milestone>
  theme: 'light' | 'dark'
}
