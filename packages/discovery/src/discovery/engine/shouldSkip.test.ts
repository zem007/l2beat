import { EthereumAddress, Hash256 } from '@l2beat/shared-pure'
import { expect, mockFn, mockObject } from 'earl'
import { ConfigReader } from '../config/ConfigReader'
import { DiscoveryConfig } from '../config/DiscoveryConfig'
import { IProvider } from '../provider/IProvider'
import { shouldSkip } from './shouldSkip'

const MockProviderForContract = mockObject<IProvider>({
  getBytecode: mockFn().resolvesTo('sourceCode'),
})

describe(shouldSkip.name, () => {
  it('skips addresses marked as ignored', async () => {
    const address = EthereumAddress.random()
    const config = new DiscoveryConfig({
      name: 'Test',
      chain: 'ethereum',
      initialAddresses: [],
      overrides: {
        [address.toString()]: {
          ignoreDiscovery: true,
        },
      },
    })
    const result = await shouldSkip(
      MockProviderForContract,
      address,
      config,
      0,
      1,
    )
    expect(result).not.toEqual(undefined)
  })

  it("it doesn't skip addresses marked as ignored when they're EOAs", async () => {
    const address = EthereumAddress.random()
    const config = new DiscoveryConfig({
      name: 'Test',
      chain: 'ethereum',
      initialAddresses: [],
      overrides: {
        [address.toString()]: {
          ignoreDiscovery: true,
        },
      },
    })
    const MockProviderForEOA = mockObject<IProvider>({
      getBytecode: mockFn().resolvesTo(''),
    })
    const result = await shouldSkip(MockProviderForEOA, address, config, 0, 1)
    expect(result).toEqual(undefined)
  })

  it('skips addresses from a shared module', async () => {
    const address = EthereumAddress.random()
    const configReader = mockObject<ConfigReader>({
      readDiscovery: () => ({
        name: 'SharedFoo',
        chain: 'ethereum',
        blockNumber: 1234,
        contracts: [
          {
            name: 'Foo',
            address,
            upgradeability: { type: 'immutable' },
          },
        ],
        eoas: [],
        abis: {},
        configHash: Hash256.random(),
        version: 123,
        usedTemplates: {},
        shapeFilesHash: Hash256.random(),
      }),
    })

    const config = new DiscoveryConfig(
      {
        name: 'Test',
        chain: 'ethereum',
        initialAddresses: [],
        names: {
          [address.toString()]: 'Foo',
        },
        sharedModules: {
          Foo: 'SharedFoo',
        },
      },
      {},
      configReader,
    )
    const result = await shouldSkip(
      MockProviderForContract,
      address,
      config,
      0,
      1,
    )
    expect(result).not.toEqual(undefined)
  })

  it('skips addresses that exceed max depth', async () => {
    const address = EthereumAddress.random()
    const config = new DiscoveryConfig({
      name: 'Test',
      chain: 'ethereum',
      initialAddresses: [],
      maxDepth: 1,
    })
    const result = await shouldSkip(
      MockProviderForContract,
      address,
      config,
      2,
      1,
    )
    expect(result).not.toEqual(undefined)
  })

  it('skips addresses that exceed max addresses', async () => {
    const address = EthereumAddress.random()
    const config = new DiscoveryConfig({
      name: 'Test',
      chain: 'ethereum',
      initialAddresses: [],
      maxAddresses: 1,
    })
    const result = await shouldSkip(
      MockProviderForContract,
      address,
      config,
      0,
      2,
    )
    expect(result).not.toEqual(undefined)
  })

  it('does not skip addresses that are not ignored', async () => {
    const address = EthereumAddress.random()
    const config = new DiscoveryConfig({
      name: 'Test',
      chain: 'ethereum',
      initialAddresses: [],
    })
    const result = await shouldSkip(
      MockProviderForContract,
      address,
      config,
      0,
      1,
    )
    expect(result).toEqual(undefined)
  })
})
