import compact from 'lodash/compact'

import { formatNumber, formatTimestamp } from '../../../../utils'
import { formatCurrency } from '../../../../utils/format'
import { RenderParams } from '../../renderer/ChartRenderer'
import { SeriesStyle } from '../../styles'
import { CostsChart } from '../../types'
import { getEntriesByDays } from '../getEntriesByDays'
import { CostsData, renderCostsHover } from '../hovers'
import { ChartControlsState, ChartUnit } from '../types'

const DENCUN_UPGRADE_TIMESTAMP = 1710288000

export function getCostsRenderParams(
  state: ChartControlsState,
): RenderParams<CostsData> {
  {
    if (state.data?.type !== 'costs') {
      throw new Error('Invalid data type')
    }

    const [_, ...compareWith] = state.data.projectsData
    const isCompared = compareWith.length > 0
    const dataInRange = getEntriesByDays(
      state.timeRangeInDays,
      state.data.projectsData,
      {
        trimLeft: true,
      },
    )

    const points = dataInRange.map((dataPoints) => {
      const [primary] = dataPoints
      const series = getSeries(dataPoints, state.unit)

      return {
        series,
        data: getData(primary, state.unit),
        milestone: state.milestones[primary[0]],
      }
    })

    const formatYAxisLabel = (value: number) =>
      state.unit === 'GAS'
        ? formatNumber(value)
        : formatCurrency(value, state.unit, { showLessThanMinimum: false })

    const seriesStyle: SeriesStyle[] = isCompared
      ? [
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
      : [
          {
            line: 'blue',
            fill: 'blue',
            point: 'circle',
          },
          {
            line: 'light-yellow',
            fill: 'light-yellow',
          },
          {
            line: 'pink',
            fill: 'pink',
          },
          {
            line: 'purple',
            fill: 'purple',
          },
        ]

    return {
      formatYAxisLabel,
      points,
      seriesStyle,
      renderHoverContents: (data) => renderCostsHover(data),
      useLogScale: state.useLogScale,
      range: [dataInRange[0][0][0], dataInRange[dataInRange.length - 1][0][0]],
      theme: state.theme,
    }
  }
}

function getSeries(dataPoints: CostsChart['data'][number][], unit: ChartUnit) {
  const [primary, ...compareWith] = dataPoints
  const [
    timestamp,
    totalGas,
    totalEth,
    totalUsd,
    overheadGas,
    overheadEth,
    overheadUsd,
    calldataGas,
    calldataEth,
    calldataUsd,
    computeGas,
    computeEth,
    computeUsd,
    blobsGas,
    blobsEth,
    blobsUsd,
  ] = primary
  const isCompared = compareWith.length > 0

  switch (unit) {
    case 'USD':
      return isCompared
        ? [
            totalUsd,
            ...compact(
              compareWith.map((data) => data[0] === timestamp && data[3]),
            ),
          ]
        : [
            overheadUsd + computeUsd + blobsUsd + calldataUsd,
            overheadUsd + computeUsd + blobsUsd,
            overheadUsd + computeUsd,
            overheadUsd,
          ]
    case 'ETH':
      return isCompared
        ? [
            totalEth,
            ...compact(
              compareWith.map((data) => data[0] === timestamp && data[2]),
            ),
          ]
        : [
            overheadEth + computeEth + blobsEth + calldataEth,
            overheadEth + computeEth + blobsEth,
            overheadEth + computeEth,
            overheadEth,
          ]
    case 'GAS':
      return isCompared
        ? [
            totalGas,
            ...compact(
              compareWith.map((data) => data[0] === timestamp && data[1]),
            ),
          ]
        : [
            overheadGas + computeGas + blobsGas + calldataGas,
            overheadGas + computeGas + blobsGas,
            overheadGas + computeGas,
            overheadGas,
          ]
  }
}

function getData(
  dataPoint: CostsChart['data'][number],
  unit: ChartUnit,
): CostsData {
  const [
    timestamp,
    totalGas,
    totalEth,
    totalUsd,
    overheadGas,
    overheadEth,
    overheadUsd,
    calldataGas,
    calldataEth,
    calldataUsd,
    computeGas,
    computeEth,
    computeUsd,
    blobsGas,
    blobsEth,
    blobsUsd,
  ] = dataPoint

  const date = formatTimestamp(timestamp, { mode: 'datetime' })
  const isPostDencun = timestamp >= DENCUN_UPGRADE_TIMESTAMP
  switch (unit) {
    case 'USD':
      return {
        date,
        total: formatCurrency(totalUsd, 'usd'),
        calldata: formatCurrency(calldataUsd, 'usd'),
        blobs: isPostDencun ? formatCurrency(blobsUsd, 'usd') : undefined,
        compute: formatCurrency(computeUsd, 'usd'),
        overhead: formatCurrency(overheadUsd, 'usd'),
      }
    case 'ETH':
      return {
        date,
        total: formatCurrency(totalEth, 'eth'),
        calldata: formatCurrency(calldataEth, 'eth'),
        blobs: isPostDencun ? formatCurrency(blobsEth, 'eth') : undefined,
        compute: formatCurrency(computeEth, 'eth'),
        overhead: formatCurrency(overheadEth, 'eth'),
      }
    case 'GAS':
      return {
        date,
        total: formatNumber(totalGas),
        calldata: formatNumber(calldataGas),
        blobs: isPostDencun ? formatNumber(blobsGas) : undefined,
        compute: formatNumber(computeGas),
        overhead: formatNumber(overheadGas),
      }
  }
}
