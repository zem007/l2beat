import { NEW_CRYPTOGRAPHY, RISK_VIEW } from '../../common'
import { ProjectDiscovery } from '../../discovery/ProjectDiscovery'
import { Badge } from '../badges'
import { polygonCDKStack } from './templates/polygonCDKStack'
import { Layer2 } from './types'

const discovery = new ProjectDiscovery('gpt')

const membersCountDAC = discovery.getContractValue<number>(
  'PolygonDataCommittee',
  'getAmountOfMembers',
)

const requiredSignaturesDAC = discovery.getContractValue<number>(
  'PolygonDataCommittee',
  'requiredAmountOfSignatures',
)

const isForcedBatchDisallowed = //??
  discovery.getContractValue<string>(
    'GptValidiumPolygonCDK',
    'forceBatchAddress',
  ) !== '0x0000000000000000000000000000000000000000'

const upgradeability = {
  upgradableBy: ['ProxyAdminOwner'],
  upgradeDelay: 'No delay',
}

export const gpt: Layer2 = polygonCDKStack({
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
            'https://etherscan.io/address/0xa36afb6b79a3d164a3d12c141c916becc6e012d8#code',
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
    name: 'GPT Protocol',
    slug: 'gpt',
    description:
      'GPT Protocol is a Validium built on the Polygon CDK stack. The purpose of the project is to create a decentralized market of AI compute power.',
    purposes: ['AI'],
    links: {
      websites: ['https://gptprotocol.org/'],
      apps: [
        'https://bridge.gptprotocol.io/',
        'https://assistant.gptprotocol.io/',
        'https://staking.gptprotocol.org/',
      ],
      documentation: [],
      explorers: ['https://explorer.gptprotocol.io/'],
      repositories: ['https://github.com/gptprotocol'],
      socialMedia: [
        'https://x.com/gpt_protocol',
        'https://t.me/gpt_protocol',
        'https://discord.com/invite/gptprotocol',
        'https://instagram.com/gptprotocol/',
      ],
    },
    activityDataSource: 'Blockchain RPC',
  },
  nonTemplateEscrows: [],
  milestones: [
    // {
    //   name: 'GPT Protocol Launch',
    //   link: '',
    //   date: '2024--',
    //   description: 'GPT Protocol is now accessible to everyone.',
    // },
  ],
  knowledgeNuggets: [],
  rollupModuleContract: discovery.getContract('GptValidiumPolygonCDK'),
  rollupVerifierContract: discovery.getContract('FflonkVerifier'),
  rpcUrl: 'https://sequencer.gptprotocol.io/',
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
