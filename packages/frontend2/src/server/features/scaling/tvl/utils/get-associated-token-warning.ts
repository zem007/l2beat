import { formatPercent } from '~/utils/get-percentage-change'

interface Params {
  name: string
  associatedRatio: number
  associatedTokens: string[]
}

export function getAssociatedTokenWarning({
  name,
  associatedRatio,
  associatedTokens,
}: Params) {
  if (associatedRatio < 0.1) return
  const sentiment: 'bad' | 'warning' = associatedRatio > 0.8 ? 'bad' : 'warning'

  const percent = formatPercent(associatedRatio)
  if (associatedTokens.length === 1) {
    const what = `The ${associatedTokens[0]} token associated with ${name}`
    return {
      content: `${what} accounts for ${percent} of the TVL!`,
      sentiment,
    }
  } else {
    const joined = associatedTokens.join(' and ')
    const what = `The ${joined} tokens associated with ${name}`
    return {
      content: `${what} account for ${percent} of the TVL!`,
      sentiment,
    }
  }
}