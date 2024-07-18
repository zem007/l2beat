import { EthereumAddress } from '@l2beat/shared-pure'
import { ProjectDiscovery } from '../../../../../../../discovery/ProjectDiscovery'
import { DaExitWindowRisk } from '../../../../types'
import { DaAttestationSecurityRisk } from '../../../../types/DaAttestationSecurityRisk'
import { CELESTIA_BLOBSTREAM } from './template'

const discovery = new ProjectDiscovery('blobstream', 'arbitrum')

const maxRangeDataCommitment = discovery.getContractValue<number>(
  'BlobstreamX',
  'DATA_COMMITMENT_MAX',
)

const headerRangeVerifier = discovery.getContractValue<string>(
  'SuccinctGateway',
  'headerRangeVerifier',
)

const nextHeaderVerifier = discovery.getContractValue<string>(
  'SuccinctGateway',
  'nextHeaderVerifier',
)

const headerRangeProvers = discovery.getContractValue<string[]>(
  'SuccinctGateway',
  'headerRangeProvers',
)

const nextHeaderProvers = discovery.getContractValue<string[]>(
  'SuccinctGateway',
  'nextHeaderProvers',
)

export const blobstreamArbitrum = CELESTIA_BLOBSTREAM({
  chain: 'arbitrum',
  contracts: {
    addresses: [
      discovery.getContractDetails('BlobstreamX', {
        description:
          'The BlobstreamX DA bridge. This contract is used to bridge data commitments between Celestia and Ethereum.',
      }),
      {
        name: 'headerRangeVerifier',
        address: EthereumAddress(headerRangeVerifier),
        description: `Verifier contract for the header range [latestBlock, targetBlock] proof.
        A request for a header range can be at most ${maxRangeDataCommitment} blocks long. The proof is generated by an off-chain prover and submitted by a relayer.`,
      },
      {
        name: 'nextHeaderVerifier',
        address: EthereumAddress(nextHeaderVerifier),
        description:
          'Verifier contract for a single header proof. Used in the rare case in which the validator set changes by more than 2/3 in a single block.',
      },
      discovery.getContractDetails('SuccinctGateway', {
        description: `This contract is the router for the bridge proofs verification. It stores the mapping between the functionId of the bridge circuit and the address of the on-chain verifier contract.
        Users can interact with this contract to request proofs on-chain, emitting a RequestCall event for off-chain provers to consume. Once a proof is generated, this contract is used as the on-chain entry point for relayers to fulfill the request and submit the proof.`,
      }),
    ],
    risks: [
      {
        category: 'Funds can be lost if',
        text: 'the bridge contract receives a malicious code upgrade. There is no delay on code upgrades.',
      },
      {
        category: 'Funds can be lost if',
        text: 'a dishonest majority of Celestia validators post incorrect or malicious data commitments.',
      },
    ],
  },
  permissions: [
    ...discovery.getMultisigPermission(
      'BlobstreamXMultisig',
      'This multisig is the admin of the BlobstreamX contract. It holds the power to change the contract state and upgrade the bridge.',
    ),
    ...discovery.getMultisigPermission(
      'SuccinctMultisig',
      'This multisig is the admin of the SuccinctGateway contract. As the manager of the entry point and router for proof verification, it holds the power to affect the liveness and safety of the bridge.',
    ),
    {
      name: 'headerRangeProvers',
      description: `List of prover (relayer) addresses that are allowed to call fulfillCallback()/fulfillCall() in the SuccinctGateway for the headerRange function ID of BlobstreamX.`,
      accounts: headerRangeProvers.map((headerRangeProver) => ({
        address: EthereumAddress(headerRangeProver),
        type: 'EOA',
      })),
    },
    {
      name: 'nextHeaderProvers',
      description: `List of prover (relayer) addresses that are allowed to call fulfillCallback()/fulfillCall() in the SuccinctGateway for the nextHeader function ID of BlobstreamX.`,
      accounts: nextHeaderProvers.map((nextHeaderProver) => ({
        address: EthereumAddress(nextHeaderProver),
        type: 'EOA',
      })),
    },
  ],
  usedIn: [
    // no project integrates it for state validation
  ],
  risks: {
    attestations: DaAttestationSecurityRisk.SigVerifiedZK(true),
    exitWindow: DaExitWindowRisk.SecurityCouncil(30 * 24 * 60 * 60),
  },
})
