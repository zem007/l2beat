import { type Bridge, type Layer2, type Layer3, safeGetTokenByAssetId } from '@l2beat/config'
import type {
  ActivityApiResponse,
  EthereumAddress,
  L2CostsApiResponse,
  ProjectId,
  TvlApiResponse,
} from '@l2beat/shared-pure'

import { assert } from '@l2beat/backend-tools'
import type { Config } from '../../../build/config'
import type { ChartProps } from '../../../components'
import type { TokenControl } from '../../../components/chart/TokenControls'
import type { TokenInfo } from '../../../scripts/charts/types'
import { unifyTokensResponse } from '../../../utils/tvl/getTvlStats'

export interface ProjectDetailsCharts {
  tvl: ChartProps | undefined
  activity: ChartProps | undefined
  costs: ChartProps | undefined
}

export function getCharts(
  project: Layer2 | Layer3 | Bridge,
  tvlApiResponse: TvlApiResponse,
  config: Config,
  activityApiResponse?: ActivityApiResponse,
  costsApiResponse?: L2CostsApiResponse,
): ProjectDetailsCharts {
  const hasTvl =
    project.config.escrows.length !== 0 &&
    !!tvlApiResponse.projects[project.id.toString()]
  const hasActivity =
    !!config?.features.activity &&
    !!activityApiResponse?.projects[project.id.toString()]
  const hasCosts = !!costsApiResponse?.projects[project.id.toString()]

  const isLayer2orLayer3 =
    project.type === 'layer2' || project.type === 'layer3'

  return {
    tvl: hasTvl
      ? {
          settingsId: `project-${project.display.slug}-tvl`,
          initialType:
            project.type === 'bridge'
              ? { type: 'project-tvl', slug: project.display.slug }
              : { type: 'project-detailed-tvl', slug: project.display.slug },
          tokens: getTokens(project.id, tvlApiResponse, isLayer2orLayer3),
          tvlBreakdownHref:
            isLayer2orLayer3 && !project.isUpcoming
              ? `/scaling/projects/${project.display.slug}/tvl-breakdown`
              : undefined,
          milestones: project.milestones,
          showComingSoon: !hasTvl && !hasActivity,
        }
      : undefined,
    activity: hasActivity
      ? {
          settingsId: `project-${project.display.slug}-activity`,
          initialType: { type: 'project-activity', slug: project.display.slug },
          milestones: project.milestones,
        }
      : undefined,
    costs: hasCosts
      ? {
          settingsId: `project-${project.display.slug}-costs`,
          initialType: { type: 'project-costs', slug: project.display.slug },
          milestones: project.milestones,
        }
      : undefined,
  }
}

export function getTokens(
  projectId: ProjectId,
  tvlApiResponse: TvlApiResponse,
  isLayer2orLayer3: boolean,
): TokenControl[] {
  const tokens = tvlApiResponse.projects[projectId.toString()]?.tokens

  const compatibleTokenList = unifyTokensResponse(tokens)

  return compatibleTokenList
    .map(({ assetId, usdValue, source, chain }) => {
      const token = safeGetTokenByAssetId(assetId)
      let symbol = token?.symbol
      if (symbol === 'USDC' && source === 'canonical') {
        if (
          projectId.toString() === 'arbitrum' ||
          projectId.toString() === 'optimism'
        ) {
          symbol = 'USDC.e'
        } else if (projectId.toString() === 'base') {
          symbol = 'USDbC'
        }
      }
      const name = token?.name
      const address = token?.address ?? 'native'
      const iconUrl = token?.iconUrl ?? ''

      // TODO: this is just temporary, so CI passes
      assert(chain, 'Chain not defined')

      if (symbol && name) {
        return {
          address: address?.toString(),
          iconUrl,
          name,
          info: getTokenInfo({
            projectId,
            source,
            address,
            chain,
            symbol,
            isLayer2orLayer3,
          }),
          tvl: usdValue,
        }
      }
    })
    .filter(notUndefined)
    .sort((a, b) => b.tvl - a.tvl)
}

function getTokenInfo({
  projectId,
  source,
  chain,
  symbol,
  address,
  isLayer2orLayer3,
}: {
  projectId: ProjectId
  source: string
  chain: string
  symbol: string
  address: EthereumAddress | 'native'
  isLayer2orLayer3: boolean
}): TokenInfo {
  if (!isLayer2orLayer3) {
    return {
      source: 'regular',
      projectId: projectId.toString(),
      symbol,
      chain,
      address: address.toString(),
    }
  }
  return {
    source: source as 'canonical' | 'external' | 'native',
    projectId: projectId.toString(),
    symbol,
    chain,
    address: address.toString(),
  }
}

function notUndefined<T>(x: T | undefined): x is T {
  return x !== undefined
}
