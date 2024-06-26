import { type Value } from '@l2beat/database'
import {
  UnixTime,
  assertUnreachable,
  type ProjectId,
  CoingeckoId,
  AssetId,
} from '@l2beat/shared-pure'
import { groupBy } from 'lodash'
import { db } from '~/server/database'
import { createPriceId } from '@l2beat/backend/src/modules/tvl/utils/createPriceId'
import { layer2s } from '@l2beat/config'
import { asNumber } from './chart-utils'

type Timespan = '7d' | '30d' | '90d' | '180d' | '1y' | 'max'
type Resolution = 'hourly' | 'sixHourly' | 'daily'

const ethPriceId = createPriceId({
  type: 'coingecko',
  coingeckoId: CoingeckoId('ethereum'),
  assetId: AssetId.ETH,
  address: 'native',
  chain: 'ethereum',
  sinceTimestamp: UnixTime.ZERO,
})

type GetTvlChartDataParameters = {
  timespan: Timespan
} & ({ type: 'project'; projectId: ProjectId } | { type: 'layer2s' })

export async function getTvlChartData(params: GetTvlChartDataParameters) {
  const projectIds = getProjectIdsFromParams(params)

  return getTvlChartDataInternal({
    projectIds,
    timespan: params.timespan,
  })
}

function getProjectIdsFromParams(params: GetTvlChartDataParameters) {
  switch (params.type) {
    case 'project':
      return [params.projectId]
    case 'layer2s':
      return layer2s.map((layer2) => layer2.id)
    default:
      assertUnreachable(params)
  }
}

async function getTvlChartDataInternal({
  projectIds,
  timespan,
}: {
  projectIds: ProjectId[]
  timespan: Timespan
}) {
  const values = await getValuesByTimespan(projectIds, timespan)
  const ethPrices = await getEthPrices()
  const chartData = getChartData(values, ethPrices)

  return { types: CHART_DATA_TYPES, data: chartData }
}

function getChartData(values: Value[], ethPrices: Record<number, number>) {
  const groupedByTimestamp = groupBy(values, (value) =>
    value.timestamp.toNumber(),
  )

  return Object.entries(groupedByTimestamp).map(([timestamp, values]) => {
    const ethPrice = ethPrices[Number(timestamp)]
    if (!ethPrice) throw new Error(`No price for timestamp ${timestamp}`)
    const getEthPrice = (price: bigint) => {
      const ethMultiplier = BigInt(Math.round(ethPrice * 100))
      return (price * 100n) / ethMultiplier
    }

    const summedValues = values.reduce(
      (acc, curr) => {
        return {
          totalUsd:
            acc.totalUsd + (curr.canonical + curr.external + curr.native),
          canonicalUsd: acc.canonicalUsd + curr.canonical,
          externalUsd: acc.externalUsd + curr.external,
          nativeUsd: acc.nativeUsd + curr.native,
          totalEth:
            acc.totalEth +
            getEthPrice(curr.canonical + curr.external + curr.native),
          canonicalEth: acc.canonicalEth + getEthPrice(curr.canonical),
          externalEth: acc.externalEth + getEthPrice(curr.external),
          nativeEth: acc.nativeEth + getEthPrice(curr.native),
        }
      },
      {
        totalUsd: 0n,
        canonicalUsd: 0n,
        externalUsd: 0n,
        nativeUsd: 0n,
        totalEth: 0n,
        canonicalEth: 0n,
        externalEth: 0n,
        nativeEth: 0n,
      },
    )
    return [
      Number(timestamp),
      asNumber(summedValues.totalUsd, 2),
      asNumber(summedValues.canonicalUsd, 2),
      asNumber(summedValues.externalUsd, 2),
      asNumber(summedValues.nativeUsd, 2),
      asNumber(summedValues.totalEth, 2),
      asNumber(summedValues.canonicalEth, 2),
      asNumber(summedValues.externalEth, 2),
      asNumber(summedValues.nativeEth, 2),
    ] as const
  })
}

async function getEthPrices() {
  const prices = await db.price.getByConfigId(ethPriceId)
  return prices.reduce<Record<number, number>>((acc, curr) => {
    acc[curr.timestamp.toNumber()] = curr.priceUsd
    return acc
  }, {})
}

async function getValuesByTimespan(
  projectIds: ProjectId[],
  timespan: Timespan,
): Promise<Value[]> {
  const days = timespanToDays(timespan)
  const resolution = daysToResolution(days)
  const now = UnixTime.now().add(-1, 'hours').toStartOf('hour')
  // 15:10 -> 15:00
  if (resolution === 'hourly') {
    const values = await db.value.getForProjectsByTimerange(projectIds, [
      now.add(-days, 'days'),
      now,
    ])
    //                                                 16 17 18 19 20 21 22 23
    // 00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    // 00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    // 00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    // 00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    // 00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    // 00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    // 00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15

    // 19 JUNE 13UTC  -> TODAY 11UTC
    console.log([now.add(-days, 'days').toDate(), now.toDate()])
    console.log(values.length)
    return values
  }

  if (resolution === 'sixHourly') {
    const targetTimestamp = now.toStartOf('six hours')
    const values = await db.value.getForProjectsByTimerange(projectIds, [
      targetTimestamp.add(-days, 'days'),
      targetTimestamp,
    ])

    return values.filter(
      (v) => v.timestamp.toNumber() % UnixTime.SIX_HOURS === 0,
    )
  }

  if (resolution === 'daily') {
    const targetTimestamp = now.toStartOf('day')
    const values = await db.value.getForProjectsByTimerange(projectIds, [
      targetTimestamp.add(-days, 'days'),
      targetTimestamp,
    ])

    return values.filter((v) => v.timestamp.toNumber() % UnixTime.DAY === 0)
  }

  assertUnreachable(resolution)
}

function daysToResolution(days: number): Resolution {
  if (days <= 7) {
    return 'hourly'
  }
  if (days <= 180) {
    return 'sixHourly'
  }
  return 'daily'
}

function timespanToDays(timespan: Timespan) {
  if (timespan.endsWith('d')) {
    return parseInt(timespan.slice(0, -1))
  }
  if (timespan.endsWith('y')) {
    return parseInt(timespan.slice(0, -1)) * 365
  }

  return Infinity
}

const CHART_DATA_TYPES = [
  'timestamp',
  'totalUsd',
  'canonicalUsd',
  'externalUsd',
  'nativeUsd',
  'totalEth',
  'canonicalEth',
  'externalEth',
  'nativeEth',
] as const
