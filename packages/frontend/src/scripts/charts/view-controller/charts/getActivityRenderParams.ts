import compact from 'lodash/compact'

import { formatTimestamp } from '../../../../utils'
import { formatTpsWithUnit } from '../../../../utils/formatTps'
import { RenderParams } from '../../renderer/ChartRenderer'
import { SeriesStyle } from '../../styles'
import { ActivityResponse } from '../../types'
import { getEntriesByDays } from '../getEntriesByDays'
import { ActivityData, renderActivityHover } from '../hovers'
import { ChartControlsState } from '../types'

export function getActivityRenderParams(
  state: ChartControlsState,
): RenderParams<ActivityData> {
  {
    if (state.data?.type !== 'activity') {
      throw new Error('Invalid data type')
    }

    const dataInRange = getEntriesByDays(
      state.timeRangeInDays,
      state.data.projectsData,
    )

    const points = dataInRange.map((dataPoints) => {
      const [primary] = dataPoints
      const [timestamp, txs, ethTxs] = primary
      const series = getSeries(dataPoints)

      const tps = getTps(txs)
      const ethTps = getTps(ethTxs)

      if (state.showEthereumTransactions) {
        series.unshift(ethTps)
      }

      return {
        series,
        data: {
          date: formatTimestamp(timestamp, { mode: 'datetime' }),
          tps,
          ethTps,
        },
        milestone: state.milestones[timestamp],
      }
    })

    const formatYAxisLabel = (x: number) => formatTpsWithUnit(x)

    const tpsPoint = 'redCircle'
    const ethTpsPoint = 'blueSquare'

    const seriesStyle: SeriesStyle[] = [
      {
        line: 'signature gradient',
        fill: 'signature gradient',
        point: tpsPoint,
      },
      {
        line: 'yellow',
      },
      {
        line: 'purple',
      },
      {
        line: 'pink',
      },
      {
        line: 'light-yellow',
      },
    ]
    if (state.showEthereumTransactions) {
      seriesStyle.unshift({
        line: 'blue gradient',
        fill: 'blue gradient',
        point: ethTpsPoint,
      })
    }

    const isAggregate = state.data.isAggregate

    return {
      formatYAxisLabel,
      points,
      seriesStyle,
      renderHoverContents: (value) =>
        renderActivityHover(
          value,
          !!state.showEthereumTransactions,
          isAggregate,
        ),
      useLogScale: state.useLogScale,
      range: [dataInRange[0][0][0], dataInRange[dataInRange.length - 1][0][0]],
      theme: state.theme,
    }
  }
}

function getTps(dailyTransactions: number) {
  return dailyTransactions / (60 * 60 * 24)
}

function getSeries(dataPoints: ActivityResponse['daily']['data'][number][]) {
  const [primary, ...compareWith] = dataPoints
  const [timestamp, txs] = primary
  if (!compareWith) throw new Error('Invalid data type')
  const compareWithValues = compact(
    compareWith.map((data) => {
      const txs = data[0] === timestamp && data[1]
      return txs ? getTps(txs) : undefined
    }),
  )
  return [getTps(txs), ...compareWithValues]
}
