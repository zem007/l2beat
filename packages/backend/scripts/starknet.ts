import { UnixTime } from '@l2beat/shared-pure'
import { readFileSync } from 'fs'
import path from 'path'

// const configMap = {
//   verifySharpAndRegister: '2a81989d',
//   verifySharpAndRegister: '28e0a0ec',
//   verifySharpAndRegister: 'a6058b50',
//   verifySharpAndRegister: '8a911881',
//   verifySharpAndRegister: '4f2ede02',
//   verifyFRI: 'a1e080af',
//   verifyFRI: '59cfb8a4',
//   verifyMerkle: 'd248fdfd',
//   verifyMerkle: '43d17683',
//   registerContinuousMemoryPage: 'def64292',
//   registerContinuousMemoryPage: 'e17b17ab',
//   registerContinuousMemoryPage: 'd1cfa355',
// }

const TX_DATA = readFileSync(path.join(__dirname, 'l2_costs.json'), {
  encoding: 'utf-8',
})

function main() {
  const raw = JSON.parse(TX_DATA) as {
    tracked_tx_id: string
    timestamp: Date
    data: {
      gasUsed: number
      gasPrice: number
    }
  }[]

  const parsedTxs = raw
    .map((tx) => ({
      ...tx,
      timestamp: UnixTime.fromDate(new Date(tx.timestamp)),
    }))
    .sort((a, b) => a.timestamp.toNumber() - b.timestamp.toNumber())
    .filter(
      (t) =>
        t.timestamp.gte(
          UnixTime.fromDate(new Date('2024-03-05 00:00:00.000000')),
        ) &&
        t.timestamp.lt(
          UnixTime.fromDate(new Date('2024-03-06 00:00:00.000000')),
        ),
    )
  let sum = 0

  parsedTxs.forEach((t) => {
    if (['def64292', 'e17b17ab', 'd1cfa355'].includes(t.tracked_tx_id)) {
      const gasPriceGwei = parseFloat((t.data.gasPrice * 1e-9).toFixed(9))
      const gasPriceETH = parseFloat((gasPriceGwei * 1e-9).toFixed(18))
      sum += t.data.gasUsed * gasPriceETH
    }
  })
  console.log('ACTUAL: ', sum)
}

main()
