import { type OnchainVerifier } from '@l2beat/config'
import { ChainId, EthereumAddress, UnixTime } from '@l2beat/shared-pure'
import { expect } from 'earl'
import { getVerifiersStatusLogic } from './get-verifiers'

describe(getVerifiersStatusLogic.name, () => {
  it('correctly maps verifier statuses', async () => {
    const result = await getVerifiersStatusLogic(
      async (address, chainId) => ({
        address,
        chainId,
        lastUsed: mockLastUsedForAddress(address),
        lastUpdated: mockLastUpdatedForAddress(address),
      }),
      () => mockVerifiers,
    )

    expect(result).toEqual([
      {
        address: '0x0000000000000000000000000000000000000001',
        timestamp: 1,
      },
      {
        address: '0x0000000000000000000000000000000000000002',
        timestamp: 2,
      },
      {
        address: '0x0000000000000000000000000000000000000003',
        timestamp: 3,
      },
    ])
  })

  it('handles missing statuses', async () => {
    const result = await getVerifiersStatusLogic(
      async () => undefined,
      () => mockVerifiers,
    )

    expect(result).toEqual([
      {
        address: '0x0000000000000000000000000000000000000001',
        timestamp: null,
      },
      {
        address: '0x0000000000000000000000000000000000000002',
        timestamp: null,
      },
      {
        address: '0x0000000000000000000000000000000000000003',
        timestamp: null,
      },
    ])
  })
})

const mockVerifiers: OnchainVerifier[] = [
  {
    name: 'Verifier 1',
    description: 'Description 1',
    contractAddress: EthereumAddress(
      '0x0000000000000000000000000000000000000001',
    ),
    chainId: ChainId(1),
    subVerifiers: [],
    verified: 'no',
  },
  {
    name: 'Verifier 2',
    description: 'Description 2',
    contractAddress: EthereumAddress(
      '0x0000000000000000000000000000000000000002',
    ),
    chainId: ChainId(1),
    subVerifiers: [],
    verified: 'no',
  },
  {
    name: 'Verifier 3',
    description: 'Description 3',
    contractAddress: EthereumAddress(
      '0x0000000000000000000000000000000000000003',
    ),
    chainId: ChainId(1),
    subVerifiers: [],
    verified: 'no',
  },
]

const mockLastUsedForAddress = (address: string) =>
  new UnixTime(parseInt(address.slice(2), 16))
const mockLastUpdatedForAddress = (address: string) =>
  new UnixTime(parseInt(address.slice(2), 16) + 1)
