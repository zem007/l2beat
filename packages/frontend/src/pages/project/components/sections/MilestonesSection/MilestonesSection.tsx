import { Milestone } from '@l2beat/config'
import React from 'react'

import { Link } from '../../../../../components/Link'
import { Markdown } from '../../../../../components/Markdown'
import { MilestoneIcon } from '../../../../../components/icons/symbols/MilestoneIcon'
import { ProjectSection } from '../common/ProjectSection'
import { ProjectSectionId } from '../common/sectionId'
import { ExpandableContainer } from './ExpandableContainer'
import { IncidentIcon } from '../../../../../components/icons/symbols/IncidentIcon'
import { cn } from '../../../../../utils/cn'

export interface MilestonesSectionProps {
  title: string
  id: ProjectSectionId
  sectionOrder: number
  milestones: Milestone[]
}

export function MilestonesSection(props: MilestonesSectionProps) {
  return (
    <ProjectSection
      title={props.title}
      id={props.id}
      sectionOrder={props.sectionOrder}
    >
      <ExpandableContainer
        className="relative"
        gradientClassName="from-white dark:from-neutral-900 md:from-gray-100 md:dark:from-zinc-900"
      >
        {/*<div className="absolute left-[15.4px] mt-2 h-full">
          <div className="h-2/5 w-[1.7px] bg-gradient-to-b from-green-400 dark:w-px dark:from-green-500" />
        </div>*/}
        <div className="ml-10">
          {props.milestones
            .sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
            )
            .map((milestone, i) => {
              // Milestones may have a type of 'general' or 'incident'
              // When the type is undefined, it is considered 'general'

              const milestoneType = milestone.type || 'general'
              const oldMilestone = props.milestones.at(i + 1)
              const oldMilestoneType =
                oldMilestone && (oldMilestone.type || 'general')

              const Icon =
                milestoneType === 'incident' ? IncidentIcon : MilestoneIcon

              const milestoneLineClassName = oldMilestoneType
                ? cn(
                    milestoneType === 'general' &&
                      'bg-green-400 dark:bg-green-500',
                    milestoneType === 'incident' &&
                      'bg-red-700 dark:bg-red-700',
                    oldMilestoneType === 'incident' &&
                      milestoneType === 'general' &&
                      'bg-gradient-to-b from-green-400 dark:from-green-500 to-red-700 dark:to-red-700',
                    oldMilestoneType === 'general' &&
                      milestoneType === 'incident' &&
                      'bg-gradient-to-b from-red-700 dark:from-red-700 to-green-400 dark:to-green-500',
                  )
                : cn(
                    'bg-gradient-to-b h-3/4',
                    milestoneType === 'incident' &&
                      'from-red-700 dark:from-red-700',
                    milestoneType === 'general' &&
                      'from-green-400 dark:from-green-500',
                  )

              return (
                <div key={i} className="pb-7 relative">
                  <div
                    className={cn(
                      'absolute w-[1.7px] top-3 -left-[1.445rem] dark:w-px h-full',
                      milestoneLineClassName,
                    )}
                  />
                  <Icon className="absolute -left-8" />
                  <p className="font-bold text-lg leading-none">
                    {milestone.name}
                  </p>
                  <p className="text-sm dark:text-gray-400">
                    {formatDate(milestone.date)}
                  </p>
                  <div className="mt-3">
                    {milestone.description && (
                      <Markdown className="text-sm leading-none dark:text-gray-400">
                        {milestone.description}
                      </Markdown>
                    )}
                    <Link className="text-sm" href={milestone.link} showArrow>
                      Learn more
                    </Link>
                  </div>
                </div>
              )
            })}
        </div>
      </ExpandableContainer>
    </ProjectSection>
  )
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = date.toLocaleDateString('en', {
    month: 'short',
  })
  const day = date.toLocaleDateString('en', {
    day: 'numeric',
  })

  const ending = getOrdinalSuffix(date.getDate())

  return `${year} ${month} ${day}${ending}`
}

function getOrdinalSuffix(days: number) {
  if (days > 3 && days < 21) return 'th'
  switch (days % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}
