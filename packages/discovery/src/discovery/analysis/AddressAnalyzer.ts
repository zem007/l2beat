import { assert } from '@l2beat/backend-tools'
import {
  ContractParameters,
  ContractValue,
  UpgradeabilityParameters,
} from '@l2beat/discovery-types'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { isEqual } from 'lodash'
import { join } from 'path'

import { flattenStartingFrom } from '../../flatten/flattenStartingFrom'
import {
  FileContent,
  ParsedFilesManager,
} from '../../flatten/ParsedFilesManager'
import { EthereumAddress } from '../../utils/EthereumAddress'
import { UnixTime } from '../../utils/UnixTime'
import { ContractOverrides } from '../config/DiscoveryOverrides'
import { DiscoveryLogger } from '../DiscoveryLogger'
import { HandlerExecutor } from '../handlers/HandlerExecutor'
import { DiscoveryProvider } from '../provider/DiscoveryProvider'
import { ProxyDetector } from '../proxies/ProxyDetector'
import {
  ContractSources,
  PerContractSource,
  SourceCodeService,
} from '../source/SourceCodeService'
import { getRelatives } from './getRelatives'

export type Analysis = AnalyzedContract | AnalyzedEOA

export interface AnalyzedContract {
  type: 'Contract'
  address: EthereumAddress
  name: string
  deploymentTimestamp?: UnixTime
  deploymentBlockNumber?: number
  derivedName: string | undefined
  isVerified: boolean
  upgradeability: UpgradeabilityParameters
  implementations: EthereumAddress[]
  values: Record<string, ContractValue>
  errors: Record<string, string>
  abis: Record<string, string[]>
  sourceBundles: PerContractSource[]
}

export interface AnalyzedEOA {
  type: 'EOA'
  address: EthereumAddress
}

const TEMPLATES_PATH = join('discovery', '_templates')
const TEMPLATE_SHAPE_FOLDER = 'shape'

interface HashedChunks {
  content: string
  length: number
}

interface HashedFileContent {
  path: string
  hashChunks: HashedChunks[]
  content: string
}

export class AddressAnalyzer {
  constructor(
    private readonly provider: DiscoveryProvider,
    private readonly proxyDetector: ProxyDetector,
    private readonly sourceCodeService: SourceCodeService,
    private readonly handlerExecutor: HandlerExecutor,
    private readonly logger: DiscoveryLogger,
  ) {}

  async analyze(
    address: EthereumAddress,
    overrides: ContractOverrides | undefined,
    blockNumber: number,
    logger: DiscoveryLogger,
  ): Promise<{ analysis: Analysis; relatives: EthereumAddress[] }> {
    const code = await this.provider.getCode(address, blockNumber)
    if (code.length === 0) {
      logger.logEoa()
      return { analysis: { type: 'EOA', address }, relatives: [] }
    }

    const deployment = await this.provider.getDeploymentInfo(address)

    const proxy = await this.proxyDetector.detectProxy(
      address,
      blockNumber,
      logger,
      overrides?.proxyType,
    )

    const sources = await this.sourceCodeService.getSources(
      address,
      proxy?.implementations,
    )
    logger.logName(sources.name)

    const flattened = flattenMainSource(sources)
    const similarTemplates = findSimilarTemplates(flattened)
    if (similarTemplates.length > 0) {
      console.log(sources.name)
      console.log(similarTemplates)
    }

    const { results, values, errors } = await this.handlerExecutor.execute(
      address,
      sources.abi,
      overrides,
      blockNumber,
      logger,
    )

    return {
      analysis: {
        type: 'Contract',
        name: overrides?.name ?? sources.name,
        derivedName: overrides?.name !== undefined ? sources.name : undefined,
        isVerified: sources.isVerified,
        address,
        deploymentTimestamp: deployment?.timestamp,
        deploymentBlockNumber: deployment?.blockNumber,
        upgradeability: proxy?.upgradeability ?? { type: 'immutable' },
        implementations: proxy?.implementations ?? [],
        values: values ?? {},
        errors: errors ?? {},
        abis: sources.abis,
        sourceBundles: sources.sources,
      },
      relatives: getRelatives(
        results,
        overrides?.ignoreRelatives,
        proxy?.relatives,
        proxy?.implementations,
      ),
    }
  }

  async hasContractChanged(
    contract: ContractParameters,
    overrides: ContractOverrides,
    blockNumber: number,
    abis: Record<string, string[]>,
  ): Promise<boolean> {
    if (contract.unverified) {
      // Check if the contract is verified now
      const { isVerified } = await this.sourceCodeService.getSources(
        contract.address,
        contract.implementations,
      )
      return isVerified
    }

    const abi = this.sourceCodeService.getRelevantAbi(
      abis,
      contract.address,
      contract.implementations,
      overrides.ignoreInWatchMode,
    )

    const { values: newValues, errors } = await this.handlerExecutor.execute(
      contract.address,
      abi,
      overrides,
      blockNumber,
      this.logger,
    )

    assert(
      errors === undefined || Object.keys(errors).length === 0,
      'Errors during watch mode',
    )

    const prevRelevantValues = getRelevantValues(
      contract.values ?? {},
      overrides.ignoreInWatchMode ?? [],
    )

    if (!isEqual(newValues, prevRelevantValues)) {
      this.logger.log(
        `Some values changed on contract ${
          contract.name
        }(${contract.address.toString()})`,
      )
      return true
    }

    return false
  }

  async hasEoaBecomeContract(
    address: EthereumAddress,
    blockNumber: number,
  ): Promise<boolean> {
    const code = await this.provider.getCode(address, blockNumber)
    if (code.length > 0) {
      this.logger.log(`EOA ${address.toString()} became a contract`)
      return true
    }

    return false
  }
}

function getRelevantValues(
  contractValues: Record<string, ContractValue | undefined>,
  ignoreInWatchMode: string[],
): Record<string, ContractValue | undefined> {
  return Object.keys(contractValues)
    .filter((key) => !ignoreInWatchMode.includes(key))
    .reduce((obj: Record<string, ContractValue | undefined>, key: string) => {
      obj[key] = contractValues[key]
      return obj
    }, {})
}

function flattenMainSource(sources: ContractSources): string {
  // Skip the proxy and get the first source
  const source =
    sources.sources.length === 1 ? sources.sources[0] : sources.sources[1]

  if (source === undefined) {
    throw Error('No sources found')
  }

  const input: FileContent[] = Object.entries(source.source.files)
    .map(([fileName, content]) => ({
      path: fileName,
      content,
    }))
    .filter((e) => e.path.endsWith('.sol'))

  const parsedFileManager = ParsedFilesManager.parseFiles(
    input,
    source.source.remappings,
  )

  const output = flattenStartingFrom(source.name, parsedFileManager)
  return output
}

function iterateFoldersRecursively(
  path: string,
  callback: (path: string) => void,
): void {
  const folders = readdirSync(path, { withFileTypes: true }).filter((x) =>
    x.isDirectory(),
  )

  if (existsSync(join(path, 'template.jsonc'))) {
    callback(path)
  }

  for (const folder of folders) {
    iterateFoldersRecursively(`${path}/${folder.name}`, callback)
  }
}

function findSimilarTemplates(flatSource: string): string[] {
  const content = removeComments(flatSource)
  const sourceHashed: HashedFileContent = {
    path: '',
    hashChunks: buildSimilarityHashmap(content),
    content,
  }
  const similarTemplates: string[] = []
  iterateFoldersRecursively(TEMPLATES_PATH, (path) => {
    const shapeFolder = join(path, TEMPLATE_SHAPE_FOLDER)
    if (existsSync(shapeFolder)) {
      const files = readdirSync(shapeFolder, {
        withFileTypes: true,
      }).filter((x) => x.isFile() && x.name.endsWith('.sol'))
      const similarities: number[] = []
      for (const file of files) {
        const shapePath = join(shapeFolder, file.name)
        const templateSource = removeComments(readFileSync(shapePath, 'utf8'))
        const templateHashed: HashedFileContent = {
          path: shapePath,
          hashChunks: buildSimilarityHashmap(removeComments(templateSource)),
          content: templateSource,
        }
        const similarity = estimateSimilarity(sourceHashed, templateHashed)
        similarities.push(similarity)
      }
      if (Math.max(...similarities) > 0.9) {
        similarTemplates.push(path)
      }
    }
  })
  return similarTemplates
}

function removeComments(source: string): string {
  let result = ''
  let isInSingleLineComment = false
  let isInMultiLineComment = false

  for (let i = 0; i < source.length; i++) {
    if (isInSingleLineComment && source[i] === '\n') {
      isInSingleLineComment = false
      result += source[i] // Keep newline characters
    } else if (
      isInMultiLineComment &&
      source[i] === '*' &&
      source[i + 1] === '/'
    ) {
      isInMultiLineComment = false
      i++ // Skip the '/'
    } else if (
      !isInMultiLineComment &&
      source[i] === '/' &&
      source[i + 1] === '/'
    ) {
      isInSingleLineComment = true
      i++ // Skip the second '/'
    } else if (
      !isInSingleLineComment &&
      source[i] === '/' &&
      source[i + 1] === '*'
    ) {
      isInMultiLineComment = true
      i++ // Skip the '*'
    } else if (!isInSingleLineComment && !isInMultiLineComment) {
      result += source[i]
    }
  }

  return result
}

function buildSimilarityHashmap(input: string): HashedChunks[] {
  const lines = splitLineKeepingNewlines(input)

  const stringChunks = lines.flatMap((line) => {
    const result = []
    for (let i = 0; i < line.length; i += 64) {
      result.push(line.slice(i, i + 64))
    }
    return result
  })

  checkIfLineCountIsCorrect(input, lines)

  const map = new Map<string, number>()

  for (const stringChunk of stringChunks) {
    const element = map.get(stringChunk)

    if (element !== undefined) {
      map.set(stringChunk, element + stringChunk.length)
    } else {
      map.set(stringChunk, stringChunk.length)
    }
  }

  // Transform that map to an array of Chunk objects
  const chunks: HashedChunks[] = Array.from(map).map(([content, length]) => ({
    content,
    length,
  }))
  // Sort alphabetically by content
  chunks.sort((lhs, rhs) => lhs.content.localeCompare(rhs.content))

  return chunks
}

function splitLineKeepingNewlines(input: string): string[] {
  const lines = []
  let start = 0

  for (let i = 0; i < input.length; i++) {
    if (input[i] === '\n') {
      const part = input.substring(start, i + 1)
      lines.push(part)
      start = i + 1
    }
  }

  if (start < input.length) {
    lines.push(input.substring(start))
  }

  return lines
}

function checkIfLineCountIsCorrect(input: string, lines: string[]): void {
  const inputLines = input.split('\n')
  if (inputLines.at(-1) === '') {
    inputLines.pop()
  }
  const inputLineCount = inputLines.length
  const linesLineCount = lines.length

  if (inputLineCount !== linesLineCount) {
    throw new Error(
      `Line count mismatch: ${inputLineCount} vs ${linesLineCount}`,
    )
  }
}

export function estimateSimilarity(
  lhs: HashedFileContent,
  rhs: HashedFileContent,
): number {
  let lhsIndex = 0
  let rhsIndex = 0
  let sourceCopied = 0

  while (true) {
    const lhsIsDone = lhsIndex === lhs.hashChunks.length
    if (lhsIsDone) {
      break
    }

    while (rhsIndex < rhs.hashChunks.length) {
      if (
        // @ts-expect-error safe assume index is correct
        lhs.hashChunks[lhsIndex].content <= rhs.hashChunks[rhsIndex].content
      ) {
        break
      }

      rhsIndex++
    }

    // @ts-expect-error safe assume index is correct
    const lhsCount = lhs.hashChunks[lhsIndex].length
    let rhsCount = 0

    if (
      rhsIndex < rhs.hashChunks.length &&
      // @ts-expect-error safe assume index is correct
      lhs.hashChunks[lhsIndex].content === rhs.hashChunks[rhsIndex].content
    ) {
      // @ts-expect-error safe assume index is correct
      rhsCount = rhs.hashChunks[rhsIndex].length
      rhsIndex++
    }

    sourceCopied += Math.min(lhsCount, rhsCount)
    lhsIndex++
  }

  return sourceCopied / Math.max(lhs.content.length, rhs.content.length)
}
