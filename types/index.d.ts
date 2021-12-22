export interface RawRoute {
  destination_token_mint: {
    decimals: number,
    pubkey: string
  },
  source_token_mint: {
    decimals: number,
    pubkey: string
  },
  amount_in: number,
  amount_out: number,
  exchanger_flag: string,
  pubkey: string,
  program_id: string,
}

export interface RawDistribution {
  routes: RawRoute[][],
  split_tx: boolean,
  destination_token_mint: {
    decimals: number,
    pubkey: string
  },
  source_token_mint: {
    decimals: number,
    pubkey: string
  },
  amount_in: number,
  amount_out: number,
  exchanger_flag: string,
}

export interface Distribution extends RawDistribution {
  id: string,
  providers: string[],
  input: number,
  output: number,
  swapRoute: {
    routes: Route[][],
    labels: string[]
  },
  offset?: number,
}

export interface Route {
  from: string,
  to: string,
  in: number,
  out: number,
  provider: string,
  ratio: number
}

export interface PriceExchange {
  from: string,
  to: string,
  input: number,
  output: number
}
