import { ProjectId } from '@l2beat/shared-pure'
import { NextResponse } from 'next/server'
import { getLatestTvlForAllProjects } from '~/server/features/tvl/get-latest-tvl-for-all-projects'
import { getTvlChartData } from '~/server/features/tvl/get-tvl-chart-data'

export async function GET() {
  const chart = await getTvlChartData({
    type: 'project',
    projectId: ProjectId('arbitrum'),
    timespan: '7d',
  })
  console.log(chart.data.length)
  const latestProjectsTvl = await getLatestTvlForAllProjects()

  const response = {
    chart,
    projects: latestProjectsTvl,
  }

  return NextResponse.json(response)
}
