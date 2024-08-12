'use client'
import { getCoreRowModel, getSortedRowModel } from '@tanstack/react-table'
import { useMemo } from 'react'
import { TabCountBadge } from '~/app/_components/badge/tab-count-badge'
import { OverflowWrapper } from '~/app/_components/overflow-wrapper'
import { BasicTable } from '~/app/_components/table/basic-table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '~/app/_components/tabs'
import { useTable } from '~/hooks/use-table'
import { type ScalingSummaryEntry } from '~/server/features/scaling/get-scaling-summary-entries'
import {
  useScalingFilter,
  useScalingFilterValues,
} from '../../../_components/scaling-filter-context'
import { toTableRows } from '../_utils/to-table-rows'
import { scalingArchivedColumns } from './table/archived/columns'
import { scalingLayer2sColumns } from './table/layer2s/columns'
import { ScalingLegend } from './table/layer2s/legend'
import { summaryLayer3sColumns } from './table/layer3s/columns'
import { scalingUpcomingColumns } from './table/upcoming/columns'

interface Props {
  projects: ScalingSummaryEntry[]
}

export function ScalingSummaryTables({ projects }: Props) {
  console.log('rendering -> ScalingSummaryTables')
  const values = useScalingFilterValues()
  const includeFilters = useScalingFilter()

  const allProjects = useMemo(
    () => projects.filter(includeFilters),
    [projects, includeFilters],
  )

  const layer2sProjects = useMemo(
    () =>
      toTableRows({
        projects: allProjects.filter(
          (item) =>
            item.type === 'layer2' && !item.isArchived && !item.isUpcoming,
        ),
        excludeAssociatedTokens: values.excludeAssociatedTokens,
      }),
    [allProjects, values.excludeAssociatedTokens],
  )

  const layer3sProjects = useMemo(
    () =>
      toTableRows({
        projects: allProjects.filter(
          (item) =>
            item.type === 'layer3' && !item.isArchived && !item.isUpcoming,
        ),
        excludeAssociatedTokens: values.excludeAssociatedTokens,
      }),
    [allProjects, values.excludeAssociatedTokens],
  )

  const upcomingProjects = useMemo(
    () =>
      toTableRows({
        projects: allProjects.filter((item) => item.isUpcoming),
        excludeAssociatedTokens: values.excludeAssociatedTokens,
      }),
    [allProjects, values.excludeAssociatedTokens],
  )

  const archivedProjects = useMemo(
    () =>
      toTableRows({
        projects: allProjects.filter((item) => item.isArchived),
        excludeAssociatedTokens: values.excludeAssociatedTokens,
      }),
    [allProjects, values.excludeAssociatedTokens],
  )

  const layer2sTable = useTable({
    data: layer2sProjects,
    columns: scalingLayer2sColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualFiltering: true,
    initialState: {
      sorting: [
        {
          id: '#',
          desc: false,
        },
      ],
    },
  })

  const layer3sTable = useTable({
    data: layer3sProjects,
    columns: summaryLayer3sColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualFiltering: true,
    initialState: {
      sorting: [
        {
          id: 'total',
          desc: true,
        },
      ],
    },
  })

  const archivedTable = useTable({
    data: archivedProjects,
    columns: scalingArchivedColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualFiltering: true,
    initialState: {
      sorting: [
        {
          id: 'total',
          desc: true,
        },
      ],
    },
  })

  const upcomingTable = useTable({
    data: upcomingProjects,
    columns: scalingUpcomingColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualFiltering: true,
    initialState: {
      sorting: [
        {
          id: '#',
          desc: false,
        },
      ],
    },
  })

  return (
    <div className="space-y-2">
      {/* <ScalingFilters items={allProjects} /> */}
      <Tabs defaultValue="layer2s" className="w-full">
        <OverflowWrapper>
          <TabsList>
            <TabsTrigger value="layer2s" className="gap-1.5">
              <span className="md:hidden">Layer2s</span>
              <span className="max-md:hidden">Layer 2 projects</span>
              <TabCountBadge>{layer2sTable.getRowCount()}</TabCountBadge>
            </TabsTrigger>
            <TabsTrigger value="layer3s" className="gap-1.5">
              <span className="md:hidden">Layer3s</span>
              <span className="max-md:hidden">Layer 3 projects</span>
              <TabCountBadge>{layer3sTable.getRowCount()}</TabCountBadge>
            </TabsTrigger>
            <TabsTrigger value="achieved" className="gap-1.5">
              <span className="md:hidden">Archived</span>
              <span className="max-md:hidden">Archived projects</span>
              <TabCountBadge>{archivedTable.getRowCount()}</TabCountBadge>
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="gap-1.5">
              <span className="md:hidden">Upcoming</span>
              <span className="max-md:hidden">Upcoming projects</span>
              <TabCountBadge>{upcomingTable.getRowCount()}</TabCountBadge>
            </TabsTrigger>
          </TabsList>
        </OverflowWrapper>
        <TabsContent value="layer2s">
          <BasicTable table={layer2sTable} />
          <ScalingLegend />
        </TabsContent>
        <TabsContent value="layer3s">
          <BasicTable table={layer2sTable} />
        </TabsContent>
        <TabsContent value="upcoming">
          <BasicTable table={upcomingTable} />
        </TabsContent>
        <TabsContent value="archived">
          <BasicTable table={archivedTable} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
