import { WarningWithSentiment } from '@l2beat/config'
import React from 'react'

import { unifyPercentagesAsIntegers } from '../../utils'
import { formatUSD } from '../../utils/utils'
import { Link } from '../Link'
import { PercentChange } from '../PercentChange'
import { UpcomingBadge } from '../badge/UpcomingBadge'
import { ValueLockedBreakdown } from '../breakdown/ValueLockedBreakdown'
import {
  CanonicalIcon,
  ExternalIcon,
  NativeIcon,
  RoundedWarningIcon,
} from '../icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip/Tooltip'

export interface TvlStats {
  tvlChange: string
  tvl: number
  canonical: number
  external: number
  native: number
}

export interface TvlSummaryProps {
  stats?: TvlStats
  tvlBreakdownHref?: string
  tvlWarning?: WarningWithSentiment
  showTvlBreakdown?: boolean
  isArchived?: boolean
  type?: 'bridge' | 'layer2' | 'layer3'
}

export function TvlSummary(props: TvlSummaryProps) {
  const parts = props.stats
    ? unifyPercentagesAsIntegers([
        props.stats.tvl === 0
          ? 100 / 3
          : (props.stats.canonical / props.stats.tvl) * 100,
        props.stats.tvl === 0
          ? 100 / 3
          : (props.stats.external / props.stats.tvl) * 100,
        props.stats.tvl === 0
          ? 100 / 3
          : (props.stats.native / props.stats.tvl) * 100,
      ])
    : undefined

  const usage = parts
    ? {
        canonical: parts[0],
        external: parts[1],
        native: parts[2],
      }
    : undefined

  const tvlStats = props.stats
    ? [
        {
          label: 'Canonically Bridged',
          shortLabel: 'Canonical',
          value: formatUSD(props.stats.canonical),
          usage: usage?.canonical ?? 1,
          icon: <CanonicalIcon />,
        },
        {
          label: 'Externally Bridged',
          shortLabel: 'External',
          value: formatUSD(props.stats.external),
          usage: usage?.external ?? 1,
          icon: <ExternalIcon />,
        },
        {
          label: 'Natively Minted',
          shortLabel: 'Native',
          value: formatUSD(props.stats.native),
          usage: usage?.native ?? 1,
          icon: <NativeIcon />,
        },
      ]
    : []

  return (
    <div className="bg-gray-100 p-4 md:flex md:flex-col md:gap-3 md:rounded-lg dark:bg-zinc-900 md:px-6 md:py-4">
      <div className="flex w-full flex-wrap items-baseline justify-between md:gap-2">
        <span className="font-medium text-lg md:hidden md:font-normal md:dark:text-gray-600 md:text-gray-500 md:text-xs">
          Value Locked
        </span>
        <span className="hidden font-bold text-gray-500 text-lg md:block md:font-normal dark:text-gray-600 md:text-xs">
          TVL
        </span>

        {props.stats && (props.stats.tvl > 0 || props.isArchived) ? (
          props.tvlWarning ? (
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <p className="font-bold text-lg md:text-2xl md:leading-none">
                  {formatUSD(props.stats.tvl)}
                </p>
                {props.stats.tvl > 0 && (
                  <p className="font-bold text-xs md:text-base">
                    <PercentChange value={props.stats.tvlChange} />
                  </p>
                )}
                {props.tvlWarning && (
                  <RoundedWarningIcon
                    className="size-4"
                    sentiment={props.tvlWarning.sentiment}
                  />
                )}
              </TooltipTrigger>
              <TooltipContent>{props.tvlWarning.content}</TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-1">
              <p className="text-nowrap font-bold text-lg md:text-2xl md:leading-none">
                {formatUSD(props.stats.tvl)}
              </p>
              {props.stats.tvl > 0 && (
                <p className="font-bold text-xs md:text-base">
                  <PercentChange value={props.stats.tvlChange} />
                </p>
              )}
              {props.tvlWarning && (
                <RoundedWarningIcon className="size-4" sentiment="warning" />
              )}
            </div>
          )
        ) : (
          <div className="w-auto">
            <UpcomingBadge />
          </div>
        )}
      </div>

      {usage && (
        <ValueLockedBreakdown {...usage} className="my-3 h-1 w-full md:my-0" />
      )}

      {props.stats ? (
        <div className="@container flex h-1/2 flex-wrap gap-3 md:gap-0">
          {tvlStats.map((s, i) => (
            <div
              key={i}
              className="flex w-full flex-nowrap items-center justify-between gap-1"
            >
              <div className="flex items-center gap-1">
                {s.icon}
                <span className="text-gray-500 text-xs leading-none dark:text-gray-600">
                  <span className="inline md:hidden">{s.label}</span>
                  <span className="hidden md:inline">{s.shortLabel}</span>
                </span>
              </div>
              <span className="whitespace-nowrap font-semibold text-base leading-none">
                {s.value}
                {props.stats && props.stats.tvl > 0 && (
                  <span className="hidden font-normal text-gray-500 @[200px]:inline">
                    {` (${s.usage}%)`}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {props.showTvlBreakdown ? (
        <div className="mt-2 flex justify-center md:mt-0">
          <Link href={props.tvlBreakdownHref} className="text-xs">
            View TVL Breakdown
          </Link>
        </div>
      ) : null}
    </div>
  )
}
