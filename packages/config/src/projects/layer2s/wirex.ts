import { NEW_CRYPTOGRAPHY, RISK_VIEW } from '../../common'
import { ProjectDiscovery } from '../../discovery/ProjectDiscovery'
import { Badge } from '../badges'
import { polygonCDKStack } from './templates/polygonCDKStack'
import { Layer2 } from './types'

const discovery = new ProjectDiscovery('wirex')

const membersCountDAC = discovery.getContractValue<number>(
  'PolygonDataCommittee',
  'getAmountOfMembers',
)

const requiredSignaturesDAC = discovery.getContractValue<number>(
  'PolygonDataCommittee',
  'requiredAmountOfSignatures',
)

const isForcedBatchDisallowed =
  discovery.getContractValue<string>(
    'WirexValidiumPolygonCDK',
    'forceBatchAddress',
  ) !== '0x0000000000000000000000000000000000000000'

const upgradeability = {
  upgradableBy: ['ProxyAdminOwner'],
  upgradeDelay: 'No delay',
}

export const wirex: Layer2 = polygonCDKStack({
  discovery,
  badges: [Badge.DA.DAC],
  daProvider: {
    name: 'DAC',
    bridge: {
      type: 'DAC Members',
      requiredSignatures: requiredSignaturesDAC,
      membersCount: membersCountDAC,
    },
    riskView: {
      ...RISK_VIEW.DATA_EXTERNAL_DAC({
        membersCount: membersCountDAC,
        requiredSignatures: requiredSignaturesDAC,
      }),
      sources: [
        {
          contract: 'PolygonDataCommittee',
          references: [
            'https://etherscan.io/address/0xace9269eac3419937093154dea0ad44c36df6963#code',
          ],
        },
      ],
    },
    technology: {
      name: 'Data is not stored on chain',
      description:
        'The transaction data is not recorded on the Ethereum main chain. Transaction data is stored off-chain and only the hashes are posted on-chain by the Sequencer, after being signed by the DAC members.',
      risks: [
        {
          category: 'Funds can be lost if',
          text: 'the external data becomes unavailable.',
          isCritical: true,
        },
      ],
      references: [
        {
          text: 'PolygonValidiumStorageMigration.sol - Etherscan source code, sequenceBatchesValidium() function',
          href: 'https://etherscan.io/address/0x10d296e8add0535be71639e5d1d1c30ae1c6bd4c#code#F1#L126',
        },
      ],
    },
  },
  display: {
    name: 'Pay Chain',
    slug: 'wirex',
    description:
      'Pay Chain is a Validium built on the Polygon CDK stack. It is used as payment chain for the Wirex non-custodial debit cards.',
    purposes: ['Payments'],
    links: {
      websites: ['https://wirexpaychain.com/'],
      apps: ['https://presale.wirexpaychain.com/'],
      documentation: [],
      explorers: [],
      repositories: [],
      socialMedia: [
        'https://x.com/wirexpaychain',
        'https://discord.gg/f8UGp4dH6g',
        'https://wirexpaychain.com/blog',
      ],
    },
  },
  rpcUrl: '',
  nonTemplateEscrows: [],
  milestones: [
    // {
    //   name: 'Witness Chain Mainnet Launch',
    //   link: 'https://x.com/witnesschain/status/1808153753897652256',
    //   date: '2024-07-02',
    //   description:
    //     'L2 Diligence proofs are now posted to Witness Chain Mainnet by Eigenlayer operators.',
    // },
  ],
  knowledgeNuggets: [],
  rollupModuleContract: discovery.getContract('WirexValidiumPolygonCDK'),
  rollupVerifierContract: discovery.getContract('FflonkVerifier'),
  isForcedBatchDisallowed,
  nonTemplateTechnology: {
    newCryptography: {
      ...NEW_CRYPTOGRAPHY.ZK_BOTH,
    },
  },
  nonTemplateContracts: [
    discovery.getContractDetails('PolygonDataCommittee', {
      description:
        'Validium data availability committee contract that allows the admin to setup the members of the committee and stores the required amount of signatures threshold.',
      ...upgradeability,
    }),
  ],
})
