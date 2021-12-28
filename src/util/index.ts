import { PROVIDER_MAP } from '../const';

import { TokenInfo } from '../util/token-registry'
import { Route, RawRoute } from '../../types'

export const queryJsonFiles = async (files: string[]) => {
  const responses = (await Promise.all(
    files.map(async (repo) => {
      try {
        const response = await fetch(repo);
        const json = (await response.json());

        return json;
      } catch {
        return []
      }
    })
  ))

  return responses
    .map((tokenlist) => tokenlist.tokens)
    .reduce((acc, arr) => (acc as TokenInfo[]).concat(arr), []);
};

export const getSwapRoute = ({
  routes,
  sourceMintSymbol,
  destinationMintSymbol,
}: {
  routes: RawRoute[][],
  sourceMintSymbol: string,
  destinationMintSymbol: string,
}): {
  routes: Route[][],
  labels: string[]
} => {
  const swapRoutes: Route[][] = routes.map((routes: RawRoute[]) => routes.map(({
    amount_in,
    amount_out,
    exchanger_flag,
    source_token_mint,
    destination_token_mint
  }: RawRoute) => ({
    from: sourceMintSymbol,
    to: destinationMintSymbol,
    in: amount_in / 10 ** source_token_mint.decimals,
    out: amount_out / 10 ** destination_token_mint.decimals,
    provider: PROVIDER_MAP[exchanger_flag],
    ratio: (amount_in / 10 ** source_token_mint.decimals) / routes.reduce((acc: number, cur: any) => acc + cur.amount_in / 10 ** source_token_mint.decimals, 0) * 100
  }
  )))

  let labels: string[] = []

  swapRoutes.forEach(routes => {
    const [first] = routes

    if (first) {
      labels.push(first.from)
      labels.push(first.to)
    }
  })

  labels = [...new Set(labels)]

  return { routes: swapRoutes, labels }
}

export const setMaxPrecision = (num: number, max = 10): number => {
  if (`${num}`.length > max) {
    return +num.toPrecision(max)
  }

  return num
}

export const getDecimalLength = (num: number) => {
  let length = 0

  if (`${num}`.includes('.')) {
    length = `${num}`.split('.')[1].length
  }

  return length
}
