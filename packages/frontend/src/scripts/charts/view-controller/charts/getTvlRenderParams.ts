import compact from 'lodash/compact'

import { formatTimestamp } from '../../../../utils'
import { formatCurrency } from '../../../../utils/format'
import { RenderParams } from '../../renderer/ChartRenderer'
import { SeriesStyle } from '../../styles'
import { AggregateDetailedTvlResponse, WithoutTimestamp } from '../../types'
import { getEntriesByDays } from '../getEntriesByDays'
import { renderTvlHover, TvlData } from '../hovers'
import { ChartControlsState } from '../types'

export function getTvlRenderParams(
  state: ChartControlsState,
): RenderParams<TvlData> {
  if (state.data?.type !== 'tvl') {
    throw new Error('Invalid data type')
  }
  if (state.unit === 'GAS') {
    throw new Error('Invalid unit')
  }

  const dataInRange = getEntriesByDays(
    state.timeRangeInDays,
    state.data.projectsData,
    {
      trimLeft: true,
    },
  )

  const useEth = state.unit === 'ETH'
  const points = dataInRange.map((dataPoints) => {
    const [timestamp, values] = dataPoints
    const [primary] = values
    const usd = primary[1]
    const eth = primary[5]
    const series = getSeries(values)
    return {
      series: useEth ? series.eth : series.usd,
      data: {
        date: formatTimestamp(timestamp, {
          mode: 'datetime',
        }),
        usd,
        eth,
      },
      milestone: state.milestones[timestamp],
    }
  })

  const formatYAxisLabel = (value: number) =>
    formatCurrency(value, state.unit, { showLessThanMinimum: false })

  const seriesStyle: SeriesStyle[] = [
    {
      line: 'signature gradient',
      fill: 'signature gradient',
      point: 'circle',
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

  return {
    formatYAxisLabel,
    points,
    seriesStyle,
    renderHoverContents: (data) => renderTvlHover(data, useEth),
    useLogScale: state.useLogScale,
    range: [dataInRange[0][0], dataInRange[dataInRange.length - 1][0]],
    theme: state.theme,
  }
}

function getSeries(
  data: WithoutTimestamp<
    AggregateDetailedTvlResponse['daily']['data'][number]
  >[],
) {
  const [primary, ...compareWith] = data
  const usd = primary[1]
  const eth = primary[5]
  const series = {
    usd: compact([usd, ...compareWith.map((data) => data[1])]),
    eth: compact([eth, ...compareWith.map((data) => data[5])]),
  }
  return series
}
