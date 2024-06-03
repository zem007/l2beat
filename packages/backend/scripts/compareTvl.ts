import { writeFileSync } from 'fs'
import { assert, TvlApiCharts, TvlApiResponse } from '@l2beat/shared-pure'
import { zip } from 'lodash'

export async function main() {
  const urlBefore = 'https://staging.l2beat.com/api/tvl2'
  const urlAfter = 'http://localhost:3000/api/tvl2'

  console.log('Downloading tvl...')
  const tvlBefore = (await fetchTvl(urlBefore)) as TvlApiResponse
  const tvlAfter = (await fetchTvl(urlAfter)) as TvlApiResponse

  // save tvlBefore and tvlAfter to files
  console.log('Saving tvlBefore and tvlAfter to files...')
  writeFileSync('tvlBefore.json', JSON.stringify(tvlBefore, null, 2))
  writeFileSync('tvlAfter.json', JSON.stringify(tvlAfter, null, 2))

  // const tvlBefore = require('./tvlBefore.json') as TvlApiResponse
  // const tvlAfter = require('./tvlAfter.json') as TvlApiResponse

  const keys = ['combined', 'layers2s', 'bridges'] as const
  for (const key of keys) {
    console.log(`Comparing ${key}...`)
    const before = tvlBefore[key]
    const after = tvlAfter[key]
    if (before === undefined || after === undefined) {
      throw new Error(`Key ${key} not found in tvlBefore or tvlAfter`)
    }

    // const charts = ["daily", "sixHourly", "hourly"] as const
    // for (const chart of charts) {
    //   const beforeChart = before[chart]
    //   const afterChart = after[chart]
    //   compareCharts(beforeChart, afterChart, chart, key);
    // }
  }

  for (const [project, before] of Object.entries(tvlBefore.projects)) {
    const after = tvlAfter.projects[project]
    if (after === undefined) {
      throw new Error(`Project ${project} not found in tvlAfter`)
    }

    assert(before, `Project ${project} not found in tvlBefore`)

    compareCharts(before.charts, after.charts, project)
  }

  console.log('Tvl is the same!')
}

function compareCharts(
  before: TvlApiCharts,
  after: TvlApiCharts,
  name: string,
) {
  const charts = ['daily', 'sixHourly', 'hourly'] as const
  for (const chart of charts) {
    const beforeChart = before[chart]
    const afterChart = after[chart]

    if (beforeChart === undefined || afterChart === undefined) {
      throw new Error(`Key ${chart} not found in ${name} before or after`)
    }

    const beforeData = beforeChart.data
    const afterData = afterChart.data

    if (beforeData.length !== afterData.length) {
      throw new Error(
        `Length of ${name} ${chart} data is different, before: ${beforeData.length}, after: ${afterData.length}`,
      )
    }

    const data = zip(beforeData, afterData)
    for (const [before, after] of data) {
      if (before === undefined || after === undefined) {
        throw new Error(`Undefined data in ${name} ${chart}`)
      }

      if (Number(before[0]) <= 1712684800) {
        continue
      }

      const values = zip(before, after)
      for (const [beforeValue, afterValue] of values) {
        if (beforeValue === undefined || afterValue === undefined) {
          throw new Error(`Undefined value in ${name} ${chart}`)
        }

        if (beforeValue !== afterValue) {
          throw new Error(
            `Different values in ${name} ${chart} ${before[0]}, before: ${beforeValue}, after: ${afterValue}`,
          )
        }
      }
    }
  }
}
export async function fetchTvl(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch TVL: ${response.statusText}`)
  }
  return response.json() as unknown
}

main()
