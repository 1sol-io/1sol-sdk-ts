import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import axios from 'axios'

import {
  CHAIN_ID,
  ONESOL_PROTOCOL_PROGRAM_ID,
} from './const';

import {
  SwapInfo,
} from './model/onesol'

import {
  TokenListContainer,
  TokenInfo
} from './util/token-registry'

export * from './model/token'
export * from './model'

export interface ConfigProps {
  apiBase: string,
}

export const defaultConfig = {
  apiBase: "https://api.1sol.io"
}

export interface Route {
  exchangerFlag: string,
  pubkey: string,
  extPubkeys: string[],
  programId: string,
  destinationTokenMint: {
    decimals: number,
    address: string
  },
  sourceTokenMint: {
    decimals: number,
    address: string
  },
  amountIn: number,
  amountOut: number,
}

export interface Distribution {
  routeType: string,
  routes: Route[][],
  destinationTokenMint: {
    decimals: number,
    address: string
  },
  sourceTokenMint: {
    decimals: number,
    address: string
  },
  amountIn: number,
  amountOut: number,
}

export class OnesolProtocol {
  private _swapInfoCache: {
    [owner: string]: { pubkey: PublicKey };
  };

  private apiBase: string = "https://api.1sol.io";

  constructor(
    private connection: Connection,
    private programId: PublicKey = ONESOL_PROTOCOL_PROGRAM_ID,
    private config: ConfigProps = defaultConfig
  ) {
    this.connection = connection;
    this.config = config
    this._swapInfoCache = {};
    this.apiBase = config.apiBase;
  }

  public async getTokenList(): Promise<TokenInfo[]> {
    const { data: { tokens } } = await axios.get(new URL(`/2/${CHAIN_ID}/token-list`, this.apiBase).href)
    const tokenList = new TokenListContainer(tokens);

    const list = tokenList.getList();

    return list
  }

  public async getRoutes({
    amount,
    sourceMintAddress,
    destinationMintAddress,
    programIds,
    experiment = false,
    size = 4,
    onlyDirect = false,
    bridgeMints = [],
    signal = (new AbortController()).signal
  }: {
    amount: number,
    sourceMintAddress: string,
    destinationMintAddress: string,
    experiment?: boolean,
    size?: number,
    onlyDirect?: boolean,
    bridgeMints?: string[],
    programIds?: string[],
    signal?: AbortSignal,
  }): Promise<Distribution[]> {
    const data = {
      amountIn: amount,
      sourceTokenMintKey: sourceMintAddress,
      destinationTokenMintKey: destinationMintAddress,
      programs: programIds,
      size,
      onlyDirect,
      bridgeMints,
      experiment
    }

    const { data: { distributions } }: {
      data: {
        distributions: Distribution[]
      }
    } = await axios({
      url: new URL(`/2/${CHAIN_ID}/routes`, this.apiBase).href,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data,
      signal
    })

    return distributions
  }

  public async getTransactions({
    wallet,
    distribution,
    slippage = 0.005,
    protocolSwapInfo = null,
    sourceTokenAccount = null,
    destinationTokenAccount = null,
    bridgeTokenAccount = null,
    openOrders = {},
    legacy = false,
  }: {
    wallet: PublicKey,
    distribution: Distribution,
    slippage?: number,
    protocolSwapInfo?: PublicKey | null,
    sourceTokenAccount?: PublicKey | null,
    destinationTokenAccount?: PublicKey | null,
    bridgeTokenAccount?: PublicKey | null,
    openOrders?: object,
    legacy?: boolean,
  }): Promise<Transaction[]> {
    const { amountOut } = distribution
    const minimumAmountOut = Math.ceil(amountOut * (1 - slippage))

    const data = {
      route: distribution,
      minimumAmountOut,
      wallet: wallet.toBase58(),
      protocolSwapInfo: protocolSwapInfo ? protocolSwapInfo.toBase58() : null,
      sourceTokenAccount: sourceTokenAccount ? sourceTokenAccount.toBase58() : null,
      destinationTokenAccount: destinationTokenAccount ? destinationTokenAccount.toBase58() : null,
      bridgeTokenAccount: bridgeTokenAccount ? bridgeTokenAccount.toBase58() : null,
      openOrders
    }

    const { data: { transactions } } = await axios({
      url: new URL(`/2/${CHAIN_ID}/transactions${legacy ? '' : '2'}`, this.apiBase).href,
      method: 'POST',
      data,
    })

    return transactions.map(transaction => Transaction.from(Buffer.from(transaction, 'base64')))
  }

  public async findSwapInfoKey(owner: PublicKey): Promise<PublicKey | null> {
    const cacheKey = owner.toBase58();

    if (cacheKey in this._swapInfoCache) {
      return this._swapInfoCache[cacheKey].pubkey
    }

    const swapInfo = await SwapInfo.findSwapInfo({
      owner,
      connection: this.connection,
      programId: this.programId,
    })

    if (swapInfo) {
      this._swapInfoCache[cacheKey] = {
        pubkey: swapInfo.pubkey
      };

      return swapInfo.pubkey;
    }

    return null
  }
}
