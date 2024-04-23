import { WithoutTimestamp } from '../types'

interface ResponseLike<T extends number[]> {
  hourly?: { data: T[] }
  sixHourly?: { data: T[] }
  daily: { data: T[] }
}

export function getEntriesByDays<T extends number[]>(
  days: number,
  response: ResponseLike<T>[],
  options: { trimLeft?: boolean } = {},
): [number, WithoutTimestamp<T>[]][] {
  const map = new Map<number, number[][]>()
  const dataInRange = response.map((r) =>
    getProjectEntriesByDays(days, r, options),
  )
  const [primary, ...rest] = dataInRange
  const timestamps = dataInRange.flatMap((d) =>
    d.map(([timestamp]) => timestamp),
  )

  for (const dataPoint of primary) {
    const [timestamp, ...rest] = dataPoint
    map.set(timestamp, [rest])
  }

  for (const dataPoints of rest) {
    for (const dataPoint of dataPoints) {
      const [timestamp, ...rest] = dataPoint
      const setValue = map.get(timestamp)
      setValue?.push(rest)
    }
  }

  return Array.from(map)
}

export function getProjectEntriesByDays<T extends number[]>(
  days: number,
  response: ResponseLike<T>,
  options: { trimLeft?: boolean } = {},
): T[] {
  if (days <= 7 && response.hourly) {
    return response.hourly.data.slice(-24 * days)
  } else if (days <= 90 && response.sixHourly) {
    return response.sixHourly.data.slice(-4 * days)
  } else {
    if (options.trimLeft) {
      const firstNonZero = response.daily.data.findIndex((p) => p[1] > 0)
      if (firstNonZero === -1) {
        // TODO: filter out tokens for which this is the case on the backend
        return response.daily.data.slice(-days)
      }
      return response.daily.data.slice(firstNonZero).slice(-days)
    }
    return response.daily.data.slice(-days)
  }
}
