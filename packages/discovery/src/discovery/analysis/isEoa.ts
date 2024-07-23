import { EthereumAddress } from '@l2beat/shared-pure'
import { IProvider } from '../provider/IProvider'

export async function isEoa(
  provider: IProvider,
  address: EthereumAddress,
): Promise<boolean> {
  const code = await provider.getBytecode(address)
  return code.length === 0
}
