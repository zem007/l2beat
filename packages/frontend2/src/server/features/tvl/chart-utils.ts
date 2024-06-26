// TODO: CHECK THIS FN
export function asNumber(value: bigint, precision: number) {
  const intPart = value / 10n ** BigInt(precision)
  const decimalPart = value - intPart * 10n ** BigInt(precision)

  const zerosBefore = precision - decimalPart.toString().length

  return (
    Number(intPart) +
    Number(
      Number(
        `0.${'0'.repeat(zerosBefore >= 0 ? zerosBefore : 0)}${decimalPart}`,
      ).toFixed(precision),
    )
  )
}

const PRICE_PRECISION = 18
const USD_DECIMALS = 2n
// TODO: CHECK THIS FN
export function calculateValue({
  amount,
  priceUsd,
  decimals,
}: {
  amount: bigint
  priceUsd: number
  decimals: number
}) {
  const bigintPriceUsd = getBigIntPrice(priceUsd, PRICE_PRECISION)
  const usdBalance = (amount * bigintPriceUsd) / 10n ** BigInt(decimals)
  const usdValue = usdBalance / 10n ** (18n - USD_DECIMALS)
  return usdValue
}
// TODO: CHECK THIS FN
export function getBigIntPrice(price: number, decimals: number): bigint {
  const priceString = price.toFixed(decimals)
  const [integerPart, fractionalPart = ''] = priceString.split('.')
  const priceWithoutDecimal = integerPart + fractionalPart.padEnd(decimals, '0')
  return BigInt(priceWithoutDecimal)
}
