import { FetchAPI } from '../../utils/FetchAPI'
import {
  ActivityResponse,
  AggregateDetailedTvlResponse,
  ChartType,
  CostsResponse,
  TokenInfo,
  TokenTvlResponse,
} from '../types'
import { ChartViewController } from '../view-controller/ChartViewController'
import { ChartData } from '../view-controller/types'

export class ChartDataController {
  private chartType?: ChartType
  private abortController?: AbortController
  private readonly cache = new Map<string, unknown>()
  private readonly fetchApi = new FetchAPI()

  constructor(private readonly chartViewController: ChartViewController) {}

  setChartType(chartType: ChartType) {
    this.chartType = chartType
    this.refetch()
  }

  showEmptyChart() {
    this.abortController?.abort()
    this.abortController = new AbortController()
    this.chartViewController.showEmptyState()
  }

  refetch() {
    if (!this.chartType) {
      return
    }
    this.abortController?.abort()
    this.abortController = new AbortController()
    this.fetchApi.setAbortSignal(this.abortController.signal)

    this.chartViewController.showLoader()
    const chartType = this.chartType
    const urls = getChartUrls(chartType)

    const requests = Promise.all(urls.map((url) => this.fetchApi.fetch(url)))
    requests
      .then(async (responses) => {
        const primary = responses[0]
        if (primary.status === 404) {
          this.chartViewController.showEmptyState()
          return
        }

        const data = await Promise.all(
          responses.map((response) => response.json),
        )

        this.parseAndConfigure(chartType, data)
        this.chartViewController.hideLoader()
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // It was aborted on purpose by user so we don't need to show error
          return
        }
        console.error(err)
        this.chartViewController.showErrorState()
      })
  }

  private parseAndConfigure(chartType: ChartType, data: unknown[]) {
    const parsedData = this.parseData(chartType, data)
    this.chartViewController.configure({ data: parsedData })
  }

  private parseData(chartType: ChartType, data: unknown[]): ChartData {
    const [primaryProject, ...toCompare] = data
    switch (chartType.type) {
      case 'scaling-tvl':
      case 'bridges-tvl':
      case 'storybook-fake-tvl':
        return {
          type: 'tvl',
          projectsData: [AggregateDetailedTvlResponse.parse(primaryProject)],
        }
      case 'project-tvl':
        return {
          type: 'tvl',
          projectsData: [
            AggregateDetailedTvlResponse.parse(primaryProject),
            ...AggregateDetailedTvlResponse.array().parse(toCompare),
          ],
        }
      case 'scaling-detailed-tvl':
      case 'project-detailed-tvl':
      case 'storybook-fake-detailed-tvl':
        return {
          type: 'detailed-tvl',
          projectData: AggregateDetailedTvlResponse.parse(primaryProject),
        }
      case 'scaling-costs':
      case 'project-costs':
      case 'storybook-fake-costs':
        return {
          type: 'costs',
          projectsData: [
            CostsResponse.parse(primaryProject),
            ...CostsResponse.array().parse(toCompare),
          ],
        }
      case 'project-token-tvl':
        return {
          type: 'token-tvl',
          tokenSymbol: chartType.info.symbol,
          tokenType: chartType.info.type,
          projectData: TokenTvlResponse.parse(primaryProject),
        }

      case 'scaling-activity':
      case 'project-activity':
      case 'storybook-fake-activity':
        return {
          type: 'activity',
          isAggregate:
            chartType.type === 'scaling-activity' &&
            chartType.filteredSlugs?.length !== 1,
          projectsData: [
            ActivityResponse.parse(primaryProject),
            ...ActivityResponse.array().parse(toCompare),
          ],
        }
      default:
        assertUnreachable(chartType)
    }
  }
}

export function getChartUrls<T extends ChartType>(
  chartType: T,
): [string, ...string[]] {
  switch (chartType.type) {
    case 'scaling-tvl':
    case 'scaling-detailed-tvl':
      return chartType.filteredSlugs
        ? [
            `/api/tvl/aggregate?projectSlugs=${chartType.filteredSlugs.join(',')}`,
          ]
        : ['/api/tvl/scaling.json']
    case 'scaling-activity':
      return chartType.filteredSlugs
        ? [
            `/api/activity/aggregate?projectSlugs=${chartType.filteredSlugs.join(
              ',',
            )}`,
          ]
        : ['/api/activity/combined.json']
    case 'scaling-costs':
      return ['/api/costs/combined.json']
    case 'bridges-tvl':
      return chartType.includeCanonical
        ? ['/api/tvl/combined.json']
        : ['/api/tvl/bridges.json']
    case 'project-tvl':
      return chartType.compareWith
        ? [
            `/api/tvl/${chartType.slug}.json`,
            ...chartType.compareWith.map((slug) => `/api/tvl/${slug}.json`),
          ]
        : [`/api/tvl/${chartType.slug}.json`]
    case 'project-detailed-tvl':
      return [`/api/tvl/${chartType.slug}.json`]
    case 'project-token-tvl':
      return [getTokenTvlUrl(chartType.info)]
    case 'project-costs':
      return chartType.compareWith
        ? [
            `/api/costs/${chartType.slug}.json`,
            ...chartType.compareWith.map((slug) => `/api/costs/${slug}.json`),
          ]
        : [`/api/costs/${chartType.slug}.json`]
    case 'project-activity':
      return chartType.compareWith
        ? [
            `/api/activity/${chartType.slug}.json`,
            ...chartType.compareWith.map(
              (slug) => `/api/activity/${slug}.json`,
            ),
          ]
        : [`/api/activity/${chartType.slug}.json`]
    case 'storybook-fake-tvl':
    case 'storybook-fake-detailed-tvl':
      return ['/fake-tvl.json']
    case 'storybook-fake-activity':
      return ['/fake-activity.json']
    case 'storybook-fake-costs':
      return ['/fake-costs.json']
    default:
      assertUnreachable(chartType)
  }
}

export function getTokenTvlUrl(info: TokenInfo) {
  const chainId = 'chainId' in info ? info.chainId : 1
  const type = info.type === 'regular' ? 'CBV' : info.type
  return `/api/projects/${info.projectId}/tvl/chains/${chainId}/assets/${info.assetId}/types/${type}`
}

function assertUnreachable(_: never): never {
  throw new Error('Unreachable code')
}
