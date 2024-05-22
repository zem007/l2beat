import { Logger } from '@l2beat/backend-tools'
import {
  ChildIndexer,
  Indexer,
  IndexerOptions,
  RetryStrategy,
} from '@l2beat/uif'

import { IndexerService } from './IndexerService'
import { assetUniqueIndexerId } from './ids'

export interface ManagedChildIndexerOptions extends IndexerOptions {
  parents: Indexer[]
  name: string
  tag?: string
  minHeight: number
  indexerService: IndexerService
  logger: Logger
  updateRetryStrategy?: RetryStrategy
  configHash?: string
}

export abstract class ManagedChildIndexer extends ChildIndexer {
  private readonly indexerId: string

  constructor(public readonly options: ManagedChildIndexerOptions) {
    super(options.logger, options.parents, options)
    this.indexerId = options.name
    if (options.tag) {
      this.indexerId += `::${options.tag}`
    }
    assetUniqueIndexerId(this.indexerId)
  }

  async initialize() {
    const safeHeight = await this.options.indexerService.getSafeHeight(
      this.indexerId,
    )

    if (safeHeight === undefined) {
      return {
        safeHeight: this.options.minHeight - 1,
        configHash: this.options.configHash,
      }
    }

    if (this.options.configHash) {
      const previousHash = await this.options.indexerService.getConfigHash(
        this.indexerId,
      )

      // TODO: test this
      if (previousHash && previousHash !== this.options.configHash) {
        this.logger.info('Config hash change detected, triggering invalidate', {
          indexerId: this.indexerId,
          previousHash,
          currentHash: this.options.configHash,
          currentHeight: safeHeight,
          targetHeight: this.options.minHeight - 1,
        })

        return {
          safeHeight: this.options.minHeight - 1,
          configHash: this.options.configHash,
        }
      }
    }

    return {
      safeHeight: safeHeight,
      configHash: this.options.configHash,
    }
  }

  async setSafeHeight(safeHeight: number) {
    return await this.options.indexerService.setSafeHeight(
      this.indexerId,
      safeHeight,
    )
  }

  async initializeState(
    safeHeight: number,
    configHash?: string | undefined,
  ): Promise<void> {
    return await this.options.indexerService.initializeState(
      this.indexerId,
      safeHeight,
      configHash,
    )
  }
}
