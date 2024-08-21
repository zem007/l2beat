import { type TvlProject } from './get-tvl-projects'

export type TvlProjectFilter =
  | { type: 'all' | TvlProject['type'] }
  | { type: 'projects'; projectIds: string[] }

export type TvlLayer2ProjectFilter = TvlProjectFilter & {
  type: 'layer2' | 'projects'
}
