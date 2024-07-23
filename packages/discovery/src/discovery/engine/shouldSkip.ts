import { EthereumAddress } from '@l2beat/shared-pure'
import { isEoa } from '../analysis/isEoa'
import { DiscoveryConfig } from '../config/DiscoveryConfig'
import { IProvider } from '../provider/IProvider'

export async function shouldSkip(
  provider: IProvider,
  address: EthereumAddress,
  config: DiscoveryConfig,
  depth: number,
  counter: number,
): Promise<string | undefined> {
  if (depth > config.maxDepth) {
    return `Error: Depth ${depth} exceeded max = ${config.maxDepth}`
  }

  if (counter > config.maxAddresses) {
    return `Error: Total addresses ${counter} exceeded max = ${config.maxAddresses}`
  }

  if (config.isInSharedModules(address)) {
    return 'Part of a shared module'
  }

  if (config.overrides.get(address).ignoreDiscovery) {
    if (await isEoa(provider, address)) {
      // We can't skip EOAs because they wouldn't appear in .eoas
      // and subsequent processes (like website rendering)
      // wouldn't know that it's an EOA
      return undefined
    }
    return 'Address is in ignoreDiscovery'
  }
}
