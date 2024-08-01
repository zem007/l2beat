import { assert } from '@l2beat/backend-tools'
import { type ValueRecord } from '@l2beat/database'
import {
  unstable_cache as cache,
  unstable_noStore as noStore,
} from 'next/cache'
import { getEthPrices } from './get-eth-prices'
import { type TvlProject, getTvlProjects } from './get-tvl-projects'
import { getTvlValuesForProjects } from './get-tvl-values-for-projects'
import { type TvlChartRange } from './range-utils'
import { sumValuesPerSource } from './sum-values-per-source'

export async function getScalingSummaryData(
  ...args: Parameters<typeof getCachedScalingSummaryData>
) {
  noStore()
  return getCachedScalingSummaryData(...args)
}

export const getCachedScalingSummaryData = cache(
  async ({
    range,
    excludeAssociatedTokens,
    ...rest
  }: { range: TvlChartRange; excludeAssociatedTokens?: boolean } & (
    | { type: 'layer2' }
    | { type: 'projects'; projectIds: string[] }
  )) => {
    const projectsFilter = (() => {
      if (rest.type === 'layer2') {
        return (project: TvlProject) =>
          ['layer2', 'layer3'].includes(project.type)
      }

      const projectIds = new Set(rest.projectIds)
      return (project: TvlProject) => projectIds.has(project.id)
    })()

    const tvlProjects = getTvlProjects().filter(projectsFilter)
    const ethPrices = await getEthPrices()

    const values = await getTvlValuesForProjects(tvlProjects, range)

    const timestampValues: Record<string, ValueRecord[]> = {}

    for (const projectValues of Object.values(values)) {
      for (const [timestamp, values] of Object.entries(projectValues)) {
        const map = timestampValues[timestamp] ?? []
        timestampValues[timestamp] = map.concat(values)
      }
    }

    const chart = Object.entries(timestampValues).map(([timestamp, values]) => {
      const summed = sumValuesPerSource(values, {
        forTotal: true,
        excludeAssociatedTokens: !!excludeAssociatedTokens,
      })
      return [
        +timestamp,
        Number(summed.native),
        Number(summed.canonical),
        Number(summed.external),
        ethPrices[+timestamp]! * 100,
      ] as const
    })

    const projectChange = Object.fromEntries(
      Object.entries(values).map(([projectId, values]) => {
        const timestamps = Object.keys(values)
        const oldestTimestamp = timestamps.reduce(
          (acc, curr) => (+curr < acc ? +curr : acc),
          Infinity,
        )
        const newestTimestamp = timestamps.reduce(
          (acc, curr) => (+curr > acc ? +curr : acc),
          -Infinity,
        )
        assert(
          values[oldestTimestamp] && values[newestTimestamp],
          "Values don't exist",
        )
        const oldest = sumValuesPerSource(values[oldestTimestamp], {
          forTotal: false,
          excludeAssociatedTokens: true,
        })
        const latest = sumValuesPerSource(values[newestTimestamp], {
          forTotal: false,
          excludeAssociatedTokens: true,
        })
        return [
          projectId,
          Number(latest.canonical + latest.external + latest.native) /
            Number(oldest.canonical + oldest.external + oldest.native) -
            1,
        ]
      }),
    )

    return { chart, projectChange }
  },
  ['getScalingSummaryData'],
  { revalidate: 60 * 10 },
)

export type ScalingSummaryData = Awaited<
  ReturnType<typeof getCachedScalingSummaryData>
>
