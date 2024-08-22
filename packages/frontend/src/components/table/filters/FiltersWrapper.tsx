import React from 'react'

import { ScalingEntry } from '../../../pages/scaling/types'

interface ProjectFilters {
  children: React.ReactNode
}

export function FiltersWrapper({ children }: ProjectFilters) {
  return (
    <div id="project-filters" className="flex gap-2">
      {children}
    </div>
  )
}

export function generateSlugList<T extends ScalingEntry>(
  items: T[],
  check?: (item: T) => boolean,
): string[] {
  let result = items

  if (check) {
    result = result.filter(check)
  }

  return result.map((i) => i.slug)
}
