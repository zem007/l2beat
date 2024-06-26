import { type Value } from '@l2beat/database'
import { type ProjectId } from '@l2beat/shared-pure'
import { db } from '~/server/database'
import { asNumber } from './chart-utils'

interface ProjectValue {
  canonical: number
  native: number
  external: number
  canonicalForTotal: number
  nativeForTotal: number
  externalForTotal: number
}

export async function getLatestTvlForAllProjects(
  projectIds?: ProjectId[],
): Promise<Record<ProjectId, ProjectValue>> {
  const res = await db.value.getLatestValuesForProjects(projectIds)
  return Object.fromEntries(
    Object.entries(
      res.reduce<
        Record<ProjectId, Omit<Value, 'projectId' | 'timestamp' | 'dataSource'>>
      >((acc, curr) => {
        const rec = acc[curr.projectId]
        if (rec === undefined) {
          acc[curr.projectId] = {
            canonical: curr.canonical,
            native: curr.native,
            external: curr.external,
            canonicalForTotal: curr.canonicalForTotal,
            nativeForTotal: curr.nativeForTotal,
            externalForTotal: curr.externalForTotal,
          }
        } else {
          acc[curr.projectId] = {
            canonical: rec.canonical + curr.canonical,
            native: rec.native + curr.native,
            external: rec.external + curr.external,
            canonicalForTotal: rec.canonicalForTotal + curr.canonicalForTotal,
            nativeForTotal: rec.nativeForTotal + curr.nativeForTotal,
            externalForTotal: rec.externalForTotal + curr.externalForTotal,
          }
        }
        return acc
      }, {}),
    ).map(
      ([projectId, value]) =>
        [
          projectId,
          {
            canonical: asNumber(value.canonical, 2),
            native: asNumber(value.native, 2),
            external: asNumber(value.external, 2),
            canonicalForTotal: asNumber(value.canonicalForTotal, 2),
            nativeForTotal: asNumber(value.nativeForTotal, 2),
            externalForTotal: asNumber(value.externalForTotal, 2),
          },
        ] as const,
    ),
  )
}
