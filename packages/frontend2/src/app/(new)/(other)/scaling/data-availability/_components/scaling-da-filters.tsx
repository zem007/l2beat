import { uniq } from 'lodash'
import React from 'react'
import { TableFilter } from '~/app/_components/table/filters/table-filter'
import { type ScalingDataAvailabilityEntry } from '~/server/features/scaling/get-scaling-da-entries'
import { BaseScalingFilters } from '../../../_components/base-scaling-filters'
import { useScalingFilterValues } from '../../../_components/scaling-filter-context'
interface Props {
  items: ScalingDataAvailabilityEntry[]
}

export function ScalingDaFilters({ items }: Props) {
  const state = useScalingFilterValues()
  const daLayerOptions = uniq(
    items.flatMap((item) => item.dataAvailability.layer.value),
  )
    .sort()
    .map((value) => ({
      label: value,
      value,
    }))

  const daLayerFilter = (
    <TableFilter
      title="DA Layer"
      options={daLayerOptions}
      value={state.daLayer}
      onValueChange={(value) => state.set({ daLayer: value })}
    />
  )

  return (
    <BaseScalingFilters items={items} additionalFiltersLeft={daLayerFilter} />
  )
}
