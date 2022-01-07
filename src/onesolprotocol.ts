import * as BufferLayout from 'buffer-layout';
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  Signer,
  Keypair,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import * as Borsh from '@project-serum/borsh';

import {
  ONESOL_PROTOCOL_PROGRAM_ID,
  SERUM_PROGRAM_ID,
  TOKEN_SWAP_PROGRAM_ID,
  SABER_STABLE_SWAP_PROGRAM_ID,
  ORCA_SWAP_PROGRAM_ID,
  RAYDIUN_V4_PROGRAM_ID,
  ONE_MOON_SWAP_PROGRAM_ID,
  CHAIN_ID,
  EXCHANGER_SERUM_DEX,
  WRAPPED_SOL_MINT,
  EXCHANGER_SPL_TOKEN_SWAP,
  EXCHANGER_ORCA_SWAP,
  EXCHANGER_ONEMOON,
  EXCHANGER_SABER_STABLE_SWAP,
  EXCHANGER_RAYDIUM
} from './const';

import {
  SplTokenSwapInfo,
  SerumDexOpenOrders,
  SaberStableSwapInfo,
  RaydiumAmmInfo,
  SerumDexMarketInfo,
} from './model'

import {
  SwapInfo,
  SwapInfoLayout
} from './model/onesol'

import {
  TokenListContainer
} from './util/token-registry'

import {
  closeTokenAccount,
  createWrappedNativeAccount,
  findOrCreateTokenAccount,
  TokenAccountInfo
} from "./model/token";

import { RawDistribution, RawRoute } from '../types'
import { TokenInfo } from './util/token-registry'

export interface configProps { }

export const defaultConfig = {}

export const SUPPORT_PROGRAM_IDS: string[] = [
  TOKEN_SWAP_PROGRAM_ID.toBase58(),
  SERUM_PROGRAM_ID.toBase58(),
  SABER_STABLE_SWAP_PROGRAM_ID.toBase58(),
  ORCA_SWAP_PROGRAM_ID.toBase58(),
  RAYDIUN_V4_PROGRAM_ID.toBase58(),
  ONE_MOON_SWAP_PROGRAM_ID.toBase58()
]
export class OnesolProtocol {
  private _openOrdersAccountsCache: {
    [publicKey: string]: { accounts: SerumDexOpenOrders[]; ts: number };
  };

  private _swapInfoCache: {
    [owner: string]: { pubkey: PublicKey };
  };

  private tokenMap: Map<string, TokenInfo>;

  public abortController: AbortController;

  constructor(
    private connection: Connection,
    private programId: PublicKey = ONESOL_PROTOCOL_PROGRAM_ID,
    private config: configProps = defaultConfig
  ) {
    this.connection = connection;
    this.config = config
    this._openOrdersAccountsCache = {};
    this._swapInfoCache = {};
    this.tokenMap = new Map<string, TokenInfo>();
    this.abortController = new AbortController()
  }

  public async getTokenList(): Promise<TokenInfo[]> {
    const response = await fetch(`https://api.1sol.io/1/token-list?chain_id=${CHAIN_ID}`)
    const tokenJSON = await response.json()
    const tokenList = new TokenListContainer(tokenJSON.tokens);

    const list = tokenList.getList();

    const tokenMap = list.reduce((map, item) => {
      map.set(item.address, item);
      return map;
    }, new Map<string, TokenInfo>());

    this.tokenMap = tokenMap;

    return list
  }

  /**
   *
   * @param {number} amount
   * @param {string} sourceMintAddress
   * @param {string} destinationMintAddress
   * @param {string[]} programIds
   */
  public async getRoutes({
    amount,
    sourceMintAddress,
    destinationMintAddress,
    programIds = SUPPORT_PROGRAM_IDS,
    signal = (new AbortController()).signal
  }: {
    amount: number,
    sourceMintAddress: string,
    destinationMintAddress: string,
    programIds?: string[],
    signal?: AbortSignal
  }): Promise<RawDistribution[]> {
    const data = {
      amount_in: amount,
      source_token_mint_key: sourceMintAddress,
      destination_token_mint_key: destinationMintAddress,
      programs: programIds
    }

    const response = await fetch(`https://api.1sol.io/1/swap/1/${CHAIN_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal
    })

    const { distributions }: {
      distributions: RawDistribution[]
    } = await response.json()

    return distributions
  }

  public getFeeTokenAccount(mintAddress: string): PublicKey | null {
    if (this.tokenMap.get(mintAddress)) {
      const feeTokenAccount = this.tokenMap.get(mintAddress).feeAccount

      if (feeTokenAccount) {
        return new PublicKey(feeTokenAccount)
      }
    }

    return null
  }

  public async composeDirectSwapInstructions({
    fromMintKey,
    toMintKey,
    fromAccount,
    toAccount,
    feeTokenAccount,
    walletAddress,
    instructions,
    signers,
    route,
    slippage
  }: {
    fromMintKey: PublicKey,
    toMintKey: PublicKey,
    fromAccount: PublicKey,
    toAccount: PublicKey,
    feeTokenAccount: PublicKey,
    walletAddress: PublicKey,
    instructions: TransactionInstruction[],
    signers: Signer[],
    route: RawRoute,
    slippage: number
  }) {
    const {
      exchanger_flag,
      pubkey,
      program_id,
      amount_in,
      amount_out,
    } = route

    const amountIn = new u64(amount_in)
    const expectAmountOut = new u64(amount_out)
    const minimumAmountOut = new u64(amount_out * (1 - slippage))
    const address = new PublicKey(pubkey)
    const programId = new PublicKey(program_id)

    const params = {
      connection: this.connection,
      address,
      programId,
    }

    const data = {
      fromTokenAccountKey: fromAccount,
      toTokenAccountKey: toAccount,
      fromMintKey,
      toMintKey,
      wallet: walletAddress,
      feeTokenAccount,
      expectAmountOut,
      minimumAmountOut,
      amountIn,
      instructions,
      signers
    }

    if ([EXCHANGER_SPL_TOKEN_SWAP, EXCHANGER_ORCA_SWAP, EXCHANGER_ONEMOON].includes(exchanger_flag)) {
      const splTokenSwapInfo = await SplTokenSwapInfo.load(params)

      if (!splTokenSwapInfo) {
        throw new Error(`SplTokenSwapInfo not found`)
      }

      await this.createSwapByTokenSwap({
        ...data,
        splTokenSwapInfo,
      })

    } else if (exchanger_flag === EXCHANGER_SERUM_DEX) {
      const openOrders = await this.findOrCreateOpenOrdersAccount({
        market: address,
        owner: walletAddress,
        serumProgramId: SERUM_PROGRAM_ID,
        instructions,
        signers
      })

      if (!openOrders) {
        throw new Error('Open orders not found')
      }

      const dexMarketInfo = await SerumDexMarketInfo.load(params)

      if (!dexMarketInfo) {
        throw new Error(`SerumDexMarketInfo not found`)
      }

      await this.createSwapBySerumDexInstruction({
        ...data,
        openOrders,
        dexMarketInfo,
      })
    } else if (exchanger_flag === EXCHANGER_SABER_STABLE_SWAP) {
      const stableSwapInfo = await SaberStableSwapInfo.load(params)

      if (!stableSwapInfo) {
        throw new Error(`SaberStableSwapInfo not found`)
      }

      await this.createSwapBySaberStableSwapInstruction({
        ...data,
        stableSwapInfo,
      })
    } else if (exchanger_flag === EXCHANGER_RAYDIUM) {
      const raydiumInfo = await RaydiumAmmInfo.load(params)

      if (!raydiumInfo) {
        throw new Error(`RaydiumAmmInfo not found`)
      }

      await this.createSwapByRaydiumSwapInstruction({
        ...data,
        raydiumInfo,
      })
    }
  }

  public async composeSwapInInstructions({
    swapInfo,
    fromAccount,
    toAccount,
    fromMintKey,
    toMintKey,
    route,
    walletAddress,
    instructions1,
    signers1,
    instructions2,
    signers2,
  }: {
    swapInfo: PublicKey,
    fromAccount: PublicKey,
    toAccount: PublicKey,
    fromMintKey: PublicKey,
    toMintKey: PublicKey,
    route: RawRoute,
    walletAddress: PublicKey,
    instructions1: TransactionInstruction[],
    signers1: Signer[],
    instructions2: TransactionInstruction[],
    signers2: Signer[],
  }): Promise<void> {
    const {
      exchanger_flag,
      pubkey,
      program_id,
      amount_in,
    } = route

    const amountIn = new u64(amount_in)
    const address = new PublicKey(pubkey)
    const programId = new PublicKey(program_id)

    const params = {
      connection: this.connection,
      address,
      programId,
    }

    const data = {
      fromTokenAccountKey: fromAccount,
      toTokenAccountKey: toAccount,
      fromMintKey,
      toMintKey,
      wallet: walletAddress,
      amountIn,
      swapInfo,
      instructions: instructions2,
      signers: signers2
    }

    if ([EXCHANGER_SPL_TOKEN_SWAP, EXCHANGER_ORCA_SWAP, EXCHANGER_ONEMOON].includes(exchanger_flag)) {
      const splTokenSwapInfo = await SplTokenSwapInfo.load(params)

      if (!splTokenSwapInfo) {
        throw new Error(`SplTokenSwapInfo not found`)
      }

      await this.createSwapInByTokenSwapInstruction({
        ...data,
        splTokenSwapInfo,
      })

    } else if (exchanger_flag === EXCHANGER_SERUM_DEX) {
      const openOrders = await this.findOrCreateOpenOrdersAccount({
        market: address,
        owner: walletAddress,
        serumProgramId: SERUM_PROGRAM_ID,
        instructions: instructions1,
        signers: signers1
      })

      if (!openOrders) {
        throw new Error('Open orders not found')
      }

      const dexMarketInfo = await SerumDexMarketInfo.load(params)

      if (!dexMarketInfo) {
        throw new Error(`SerumDexMarketInfo not found`)
      }

      await this.createSwapInBySerumDexInstruction({
        ...data,
        openOrders,
        dexMarketInfo,
      })
    } else if (exchanger_flag === EXCHANGER_SABER_STABLE_SWAP) {
      const stableSwapInfo = await SaberStableSwapInfo.load(params)

      if (!stableSwapInfo) {
        throw new Error(`SaberStableSwapInfo not found`)
      }

      await this.createSwapInBySaberStableSwapInstruction({
        ...data,
        stableSwapInfo,
      })
    } else if (exchanger_flag === EXCHANGER_RAYDIUM) {
      const raydiumInfo = await RaydiumAmmInfo.load(params)

      if (!raydiumInfo) {
        throw new Error(`RaydiumAmmInfo not found`)
      }

      await this.createSwapInByRaydiumSwapInstruction({
        ...data,
        raydiumInfo,
      })
    }
  }

  public async composeSwapOutInstructions({
    swapInfo,
    fromAccount,
    toAccount,
    fromMintKey,
    toMintKey,
    feeTokenAccount,
    route,
    walletAddress,
    slippage,
    instructions1,
    signers1,
    instructions2,
    signers2,
  }: {
    swapInfo: PublicKey,
    fromAccount: PublicKey,
    toAccount: PublicKey,
    fromMintKey: PublicKey,
    toMintKey: PublicKey,
    feeTokenAccount: PublicKey,
    route: RawRoute,
    walletAddress: PublicKey,
    slippage: number,
    instructions1: TransactionInstruction[],
    signers1: Signer[],
    instructions2: TransactionInstruction[],
    signers2: Signer[],
  }): Promise<void> {
    const {
      exchanger_flag,
      pubkey,
      program_id,
      amount_out: amountOut,
    } = route

    const expectAmountOut = new u64(amountOut)
    const minimumAmountOut = new u64(amountOut * (1 - slippage))
    const address = new PublicKey(pubkey)
    const programId = new PublicKey(program_id)

    const params = {
      connection: this.connection,
      address,
      programId,
    }

    const data = {
      fromTokenAccountKey: fromAccount,
      toTokenAccountKey: toAccount,
      fromMintKey,
      toMintKey,
      wallet: walletAddress,
      feeTokenAccount,
      swapInfo,
      expectAmountOut,
      minimumAmountOut,
      instructions: instructions2,
      signers: signers2
    }

    if ([EXCHANGER_SPL_TOKEN_SWAP, EXCHANGER_ORCA_SWAP, EXCHANGER_ONEMOON].includes(exchanger_flag)) {
      const splTokenSwapInfo = await SplTokenSwapInfo.load(params)

      if (!splTokenSwapInfo) {
        throw new Error(`SplTokenSwapInfo not found`)
      }

      await this.createSwapOutByTokenSwapInstruction({
        ...data,
        splTokenSwapInfo,
      })

    } else if (exchanger_flag === EXCHANGER_SERUM_DEX) {
      const openOrders = await this.findOrCreateOpenOrdersAccount({
        market: address,
        owner: walletAddress,
        serumProgramId: SERUM_PROGRAM_ID,
        instructions: instructions1,
        signers: signers1
      })

      if (!openOrders) {
        throw new Error('Open orders not found')
      }

      const dexMarketInfo = await SerumDexMarketInfo.load(params)

      if (!dexMarketInfo) {
        throw new Error(`SerumDexMarketInfo not found`)
      }

      await this.createSwapOutBySerumDexInstruction({
        ...data,
        openOrders,
        dexMarketInfo,
      })
    } else if (exchanger_flag === EXCHANGER_SABER_STABLE_SWAP) {
      const stableSwapInfo = await SaberStableSwapInfo.load(params)

      if (!stableSwapInfo) {
        throw new Error(`SaberStableSwapInfo not found`)
      }

      await this.createSwapOutBySaberStableSwapInstruction({
        ...data,
        stableSwapInfo,
      })
    } else if (exchanger_flag === EXCHANGER_RAYDIUM) {
      const raydiumInfo = await RaydiumAmmInfo.load(params)

      if (!raydiumInfo) {
        throw new Error(`RaydiumAmmInfo not found`)
      }

      await this.createSwapOutByRaydiumSwapInstruction({
        ...data,
        raydiumInfo,
      })
    }
  }

  public async composeIndirectSwapInstructions({
    swapInfo,
    routes,
    fromAccount,
    toAccount,
    middleAccount,
    fromMintKey,
    toMintKey,
    middleMintKey,
    feeTokenAccount,
    walletAddress,
    slippage,
    instructions1,
    signers1,
    instructions2,
    signers2,
  }: {
    swapInfo: PublicKey,
    routes: RawRoute[][],
    fromAccount: PublicKey,
    toAccount: PublicKey,
    middleAccount: PublicKey,
    fromMintKey: PublicKey,
    toMintKey: PublicKey,
    middleMintKey: PublicKey,
    feeTokenAccount: PublicKey,
    walletAddress: PublicKey,
    slippage: number,
    instructions1: TransactionInstruction[],
    signers1: Signer[],
    instructions2: TransactionInstruction[],
    signers2: Signer[],
  }) {
    const [routesOne, routesTwo] = routes
    const [one] = routesOne
    const [two] = routesTwo

    await this.setupSwapInfo({
      swapInfo,
      tokenAccount: middleAccount,
      instructions: instructions2,
      signers: signers2
    })

    await this.composeSwapInInstructions({
      swapInfo,
      fromAccount,
      toAccount: middleAccount,
      fromMintKey,
      toMintKey: middleMintKey,
      route: one,
      walletAddress,
      instructions1,
      signers1,
      instructions2,
      signers2,
    })

    await this.composeSwapOutInstructions({
      swapInfo,
      fromAccount: middleAccount,
      toAccount,
      fromMintKey: middleAccount,
      toMintKey,
      feeTokenAccount,
      route: two,
      walletAddress,
      slippage,
      instructions1,
      signers1,
      instructions2,
      signers2,
    })
  }

  public async composeInstructions({
    option,
    walletAddress,
    fromTokenAccount,
    toTokenAccount,
    instructions1,
    instructions2,
    instructions3,
    signers1,
    signers2,
    signers3,
    slippage = 0.005,
  }: {
    option: RawDistribution,
    walletAddress: PublicKey,
    fromTokenAccount: TokenAccountInfo,
    toTokenAccount: TokenAccountInfo,
    instructions1: TransactionInstruction[],
    instructions2: TransactionInstruction[],
    instructions3: TransactionInstruction[],
    signers1: Signer[],
    signers2: Signer[],
    signers3: Signer[],
    slippage?: number,
  }) {
    if (!option || !option.routes || !option.routes.length) {
      throw new Error('No route found')
    }

    if (!walletAddress) {
      throw new Error('walletAddress is required')
    }

    const { amount_in, source_token_mint, destination_token_mint } = option

    if (!fromTokenAccount || (!fromTokenAccount.mint.equals(WRAPPED_SOL_MINT) && !fromTokenAccount.pubkey)) {
      throw new Error('fromTokenAccount is required')
    }

    if (fromTokenAccount.mint.toBase58() !== source_token_mint.pubkey) {
      throw new Error('fromTokenAccount.mint is different from source_token_mint')
    }

    if (toTokenAccount.mint.toBase58() !== destination_token_mint.pubkey) {
      throw new Error('toTokenAccount.mint is different from destination_token_mint')
    }

    const feeTokenAccount = this.getFeeTokenAccount(destination_token_mint.pubkey)

    if (!feeTokenAccount) {
      throw new Error('feeTokenAccount is required')
    }

    const cleanInstructions: TransactionInstruction[] = []
    const cleanSigners: Signer[] = []

    const fromMintKey = new PublicKey(source_token_mint.pubkey)
    const toMintKey = new PublicKey(destination_token_mint.pubkey)

    let fromAccount = fromTokenAccount.pubkey

    if (fromTokenAccount.mint.equals(WRAPPED_SOL_MINT)) {
      fromAccount = await createWrappedNativeAccount({
        connection: this.connection,
        owner: walletAddress,
        payer: walletAddress,
        amount: amount_in,
        instructions: instructions1,
        signers: signers1,
      })

      await closeTokenAccount({
        account: fromAccount,
        wallet: walletAddress,
        instructions: cleanInstructions,
      })
    }

    const toAccount = await findOrCreateTokenAccount({
      connection: this.connection,
      owner: walletAddress,
      payer: walletAddress,
      mint: toMintKey,
      instructions: instructions1,
      signers: signers1,
      cleanInstructions,
      cleanSigners
    })

    // direct swap (USDC -> 1SOL)
    if (option.routes.length === 1) {
      const [routes] = option.routes

      const promises = routes.map(
        async (route: RawRoute) =>
          this.composeDirectSwapInstructions({
            fromMintKey,
            toMintKey,
            fromAccount: fromAccount!,
            toAccount: toAccount!,
            feeTokenAccount,
            walletAddress,
            instructions: instructions1,
            signers: signers1,
            route,
            slippage
          }))

      await Promise.all(promises)

      instructions1.concat(cleanInstructions)
      signers1.concat(cleanSigners)
    } else if (option.routes.length === 2) {
      const [routes] = option.routes
      const [first] = routes

      const middleMintKey = new PublicKey(first.destination_token_mint.pubkey)

      const middleAccount = await findOrCreateTokenAccount({
        connection: this.connection,
        owner: walletAddress,
        payer: walletAddress,
        mint: middleMintKey,
        instructions: instructions1,
        signers: signers1,
        cleanInstructions,
        cleanSigners
      })

      const swapInfo = await this.findOrCreateSwapInfo({
        owner: walletAddress,
        instructions: instructions1,
        signers: signers1
      })

      await this.composeIndirectSwapInstructions({
        swapInfo,
        routes: option.routes,
        fromAccount: fromAccount!,
        toAccount: toAccount!,
        middleAccount,
        fromMintKey,
        toMintKey,
        middleMintKey,
        feeTokenAccount,
        walletAddress,
        slippage,
        instructions1,
        signers1,
        instructions2,
        signers2,
      })

      instructions3.concat(cleanInstructions)
      signers3.concat(cleanSigners)
    }
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

  public async createSwapInfo({
    instructions, signers, owner
  }: {
    owner: PublicKey;
    instructions: Array<TransactionInstruction>,
    signers: Array<Signer>,
  }): Promise<PublicKey> {
    const swapInfoAccount = Keypair.generate();
    const lamports = await this.connection.getMinimumBalanceForRentExemption(SwapInfoLayout.span);
    instructions.push(await SystemProgram.createAccount({
      fromPubkey: owner,
      newAccountPubkey: swapInfoAccount.publicKey,
      lamports: lamports,
      space: SwapInfoLayout.span,
      programId: this.programId,
    }));
    signers.push(swapInfoAccount);
    instructions.push(await OnesolProtocol.makeSwapInfoInstruction({
      swapInfo: swapInfoAccount.publicKey,
      owner,
      programId: this.programId,
    }));
    return swapInfoAccount.publicKey;
  }

  public async findOrCreateSwapInfo({
    owner, instructions, signers
  }: {
    owner: PublicKey,
    instructions: TransactionInstruction[],
    signers: Signer[],
  }): Promise<PublicKey> {
    const swapInfoKey = await this.findSwapInfoKey(owner);
    if (swapInfoKey) {
      return swapInfoKey;
    }
    return await this.createSwapInfo({
      owner: owner,
      instructions: instructions,
      signers: signers,
    })
  }

  public async setupSwapInfo(
    { swapInfo, tokenAccount, instructions, signers }: {
      swapInfo: PublicKey,
      tokenAccount: PublicKey,
      instructions: TransactionInstruction[],
      signers: Signer[],
    }
  ) {
    const keys = [
      { pubkey: swapInfo, isSigner: false, isWritable: true },
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
    ];
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
    ]);
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({
      instruction: 11,
    }, data);

    instructions.push(new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    }));
  }

  static async makeSwapInfoInstruction(
    { swapInfo, programId, owner }: {
      owner: PublicKey;
      swapInfo: PublicKey,
      programId: PublicKey,
    }): Promise<TransactionInstruction> {

    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
    ]);
    const dataMap: any = {
      instruction: 10, // Swap instruction
    };
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    const keys = [
      { pubkey: swapInfo, isSigner: true, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async findOpenOrdersAccountForOwner({
    owner,
    cacheDurationMs = 86400000,
    serumProgramId = SERUM_PROGRAM_ID,
    market,
  }: {
    owner: PublicKey
    market: PublicKey,
    cacheDurationMs?: number,
    serumProgramId?: PublicKey,
  }) {
    const ownerStr = `${owner.toBase58()}-${market.toBase58()}`;
    const now = new Date().getTime();
    if (ownerStr in this._openOrdersAccountsCache &&
      now - this._openOrdersAccountsCache[ownerStr].ts < cacheDurationMs) {
      return this._openOrdersAccountsCache[ownerStr].accounts;
    }
    const layout = SerumDexOpenOrders.getLayout();
    const openOrdersAccounts = await SerumDexOpenOrders.findForMarketAndOwner(this.connection, market, owner, serumProgramId);
    this._openOrdersAccountsCache[ownerStr] = {
      accounts: openOrdersAccounts,
      ts: now,
    }
    return openOrdersAccounts;
  }

  async createOpenOrdersAccountInstruction({
    market, owner, serumProgramId
  }: {
    market: PublicKey
    owner: PublicKey,
    serumProgramId: PublicKey,
  },
    instructions: Array<TransactionInstruction>,
    signers: Array<Signer>
  ): Promise<PublicKey> {
    const openOrdersAccounts = Keypair.generate();
    instructions.push(await OnesolProtocol.makeCreateOpenOrdersAccountInstruction({
      connection: this.connection,
      owner: owner,
      newAccountAddress: openOrdersAccounts.publicKey,
      serumProgramId,
    }));
    signers.push(openOrdersAccounts);
    this._openOrdersAccountsCache[`${owner.toBase58()}-${market.toBase58()}`].ts = 0;

    return openOrdersAccounts.publicKey;
  }

  async findOrCreateOpenOrdersAccount({
    market, owner, serumProgramId = SERUM_PROGRAM_ID, instructions, signers, cacheDurationMs = 86400000
  }: {
    market: PublicKey,
    owner: PublicKey,
    serumProgramId?: PublicKey,
    cacheDurationMs?: number,
    instructions: Array<TransactionInstruction>,
    signers: Array<Signer>
  }): Promise<PublicKey> {
    const openOrders = await this.findOpenOrdersAccountForOwner({
      owner,
      market,
      serumProgramId,
      cacheDurationMs
    });
    if (openOrders.length === 0) {
      const openOrdersAddress = await this.createOpenOrdersAccountInstruction({
        market, owner, serumProgramId,
      }, instructions, signers);
      return openOrdersAddress;
    } else {
      return openOrders[0].address;
    }
  }

  static async makeCreateOpenOrdersAccountInstruction(
    {
      connection, owner, newAccountAddress, serumProgramId = SERUM_PROGRAM_ID
    }: {
      connection: Connection,
      owner: PublicKey,
      newAccountAddress: PublicKey,
      serumProgramId?: PublicKey,
    }
  ) {
    const layout = SerumDexOpenOrders.getLayout();
    return SystemProgram.createAccount({
      fromPubkey: owner,
      newAccountPubkey: newAccountAddress,
      lamports: await connection.getMinimumBalanceForRentExemption(
        layout.span,
      ),
      space: layout.span,
      programId: serumProgramId,
    });
  }

  async createSwapByTokenSwap(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      feeTokenAccount,
      amountIn,
      expectAmountOut,
      minimumAmountOut,
      splTokenSwapInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      feeTokenAccount: PublicKey;
      amountIn: u64;
      expectAmountOut: u64;
      minimumAmountOut: u64;
      splTokenSwapInfo: SplTokenSwapInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapByTokenSwapInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMint: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMint: toMintKey,
        wallet: wallet,
        feeTokenAccount: feeTokenAccount,
        tokenProgramId: TOKEN_PROGRAM_ID,
        splTokenSwapInfo: splTokenSwapInfo,
        amountIn: amountIn,
        expectAmountOut: expectAmountOut,
        minimumAmountOut: minimumAmountOut,
        programId: this.programId,
      })
    );
  }

  static async makeSwapByTokenSwapInstruction({
    sourceTokenKey,
    sourceMint,
    destinationTokenKey,
    destinationMint,
    wallet,
    tokenProgramId = TOKEN_PROGRAM_ID,
    feeTokenAccount,
    splTokenSwapInfo,
    amountIn,
    expectAmountOut,
    minimumAmountOut,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMint: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMint: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    feeTokenAccount: PublicKey;
    splTokenSwapInfo: SplTokenSwapInfo;
    amountIn: u64;
    expectAmountOut: u64;
    minimumAmountOut: u64;
    programId?: PublicKey;
  }): Promise<TransactionInstruction> {

    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("amountIn"),
      Borsh.u64("expectAmountOut"),
      Borsh.u64("minimumAmountOut"),
    ]);

    let dataMap: any = {
      instruction: 3, // Swap instruction
      amountIn: amountIn,
      expectAmountOut: expectAmountOut,
      minimumAmountOut: minimumAmountOut,
    };

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true }
    ];

    const swapKeys = splTokenSwapInfo.toKeys();
    keys.push(...swapKeys);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapInByTokenSwapInstruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      swapInfo,
      amountIn,
      splTokenSwapInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      swapInfo: PublicKey,
      amountIn: u64;
      splTokenSwapInfo: SplTokenSwapInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapInByTokenSwapInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMint: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMint: toMintKey,
        wallet: wallet,
        swapInfo: swapInfo,
        tokenProgramId: TOKEN_PROGRAM_ID,
        splTokenSwapInfo: splTokenSwapInfo,
        amountIn: amountIn,
        programId: this.programId,
      })
    );
  }

  static async makeSwapInByTokenSwapInstruction({
    sourceTokenKey,
    sourceMint,
    destinationTokenKey,
    destinationMint,
    wallet,
    tokenProgramId = TOKEN_PROGRAM_ID,
    swapInfo,
    splTokenSwapInfo,
    amountIn,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMint: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMint: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    swapInfo: PublicKey,
    splTokenSwapInfo: SplTokenSwapInfo;
    amountIn: u64;
    programId?: PublicKey;
  }): Promise<TransactionInstruction> {

    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("amountIn"),
    ]);

    let dataMap: any = {
      instruction: 12, // Swap instruction
      amountIn: amountIn,
    };

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: swapInfo, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ];

    const swapKeys = splTokenSwapInfo.toKeys();
    keys.push(...swapKeys);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapOutByTokenSwapInstruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      feeTokenAccount,
      swapInfo,
      expectAmountOut,
      minimumAmountOut,
      splTokenSwapInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      feeTokenAccount: PublicKey;
      swapInfo: PublicKey,
      expectAmountOut: u64;
      minimumAmountOut: u64;
      splTokenSwapInfo: SplTokenSwapInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapOutByTokenSwapInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMint: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMint: toMintKey,
        wallet: wallet,
        feeTokenAccount: feeTokenAccount,
        swapInfo: swapInfo,
        tokenProgramId: TOKEN_PROGRAM_ID,
        splTokenSwapInfo: splTokenSwapInfo,
        expectAmountOut: expectAmountOut,
        minimumAmountOut: minimumAmountOut,
        programId: this.programId,
      })
    );
  }

  static async makeSwapOutByTokenSwapInstruction({
    sourceTokenKey,
    sourceMint,
    destinationTokenKey,
    destinationMint,
    wallet,
    tokenProgramId = TOKEN_PROGRAM_ID,
    feeTokenAccount,
    splTokenSwapInfo,
    swapInfo,
    expectAmountOut,
    minimumAmountOut,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMint: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMint: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    feeTokenAccount: PublicKey;
    splTokenSwapInfo: SplTokenSwapInfo;
    swapInfo: PublicKey,
    expectAmountOut: u64;
    minimumAmountOut: u64;
    programId?: PublicKey;
  }): Promise<TransactionInstruction> {

    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("expectAmountOut"),
      Borsh.u64("minimumAmountOut"),
    ]);

    let dataMap: any = {
      instruction: 13, // Swap instruction
      expectAmountOut: expectAmountOut,
      minimumAmountOut: minimumAmountOut,
    };

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: swapInfo, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true }
    ];

    const swapKeys = splTokenSwapInfo.toKeys();
    keys.push(...swapKeys);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }


  async createSwapBySaberStableSwapInstruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      feeTokenAccount,
      amountIn,
      expectAmountOut,
      minimumAmountOut,
      stableSwapInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      feeTokenAccount: PublicKey;
      amountIn: u64;
      expectAmountOut: u64;
      minimumAmountOut: u64;
      stableSwapInfo: SaberStableSwapInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapBySaberStableSwapInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMint: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMint: toMintKey,
        wallet: wallet,
        tokenProgramId: TOKEN_PROGRAM_ID,
        feeTokenAccount: feeTokenAccount,
        stableSwapInfo: stableSwapInfo,
        amountIn: amountIn,
        expectAmountOut: expectAmountOut,
        minimumAmountOut: minimumAmountOut,
        programId: this.programId,
      })
    );
  }

  static async makeSwapBySaberStableSwapInstruction({
    sourceTokenKey,
    sourceMint,
    destinationTokenKey,
    destinationMint,
    wallet,
    tokenProgramId = TOKEN_PROGRAM_ID,
    feeTokenAccount,
    stableSwapInfo,
    amountIn,
    expectAmountOut,
    minimumAmountOut,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMint: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMint: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    feeTokenAccount: PublicKey;
    stableSwapInfo: SaberStableSwapInfo;
    amountIn: u64;
    expectAmountOut: u64;
    minimumAmountOut: u64;
    programId?: PublicKey
  }): Promise<TransactionInstruction> {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("amountIn"),
      Borsh.u64("expectAmountOut"),
      Borsh.u64("minimumAmountOut"),
    ]);

    let dataMap: any = {
      instruction: 6,
      amountIn: amountIn,
      expectAmountOut: expectAmountOut,
      minimumAmountOut: minimumAmountOut,
    };

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true }
    ];
    const swapKeys = stableSwapInfo.toKeys(sourceMint);
    keys.push(...swapKeys);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapInBySaberStableSwapInstruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      swapInfo,
      amountIn,
      stableSwapInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      swapInfo: PublicKey;
      amountIn: u64;
      stableSwapInfo: SaberStableSwapInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapInBySaberStableSwapInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMint: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMint: toMintKey,
        wallet: wallet,
        tokenProgramId: TOKEN_PROGRAM_ID,
        swapInfo: swapInfo,
        stableSwapInfo: stableSwapInfo,
        amountIn: amountIn,
        programId: this.programId,
      })
    );
  }

  static async makeSwapInBySaberStableSwapInstruction({
    sourceTokenKey,
    sourceMint,
    destinationTokenKey,
    destinationMint,
    wallet,
    tokenProgramId = TOKEN_PROGRAM_ID,
    swapInfo,
    stableSwapInfo,
    amountIn,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMint: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMint: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    swapInfo: PublicKey;
    stableSwapInfo: SaberStableSwapInfo;
    amountIn: u64;
    programId?: PublicKey
  }): Promise<TransactionInstruction> {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("amountIn"),
    ]);

    let dataMap: any = {
      instruction: 16,
      amountIn: amountIn,
    };

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: swapInfo, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ];
    const swapKeys = stableSwapInfo.toKeys(sourceMint);
    keys.push(...swapKeys);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapOutBySaberStableSwapInstruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      feeTokenAccount,
      swapInfo,
      expectAmountOut,
      minimumAmountOut,
      stableSwapInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      feeTokenAccount: PublicKey;
      swapInfo: PublicKey;
      expectAmountOut: u64;
      minimumAmountOut: u64;
      stableSwapInfo: SaberStableSwapInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapOutBySaberStableSwapInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMint: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMint: toMintKey,
        wallet: wallet,
        tokenProgramId: TOKEN_PROGRAM_ID,
        swapInfo: swapInfo,
        feeTokenAccount: feeTokenAccount,
        stableSwapInfo: stableSwapInfo,
        expectAmountOut: expectAmountOut,
        minimumAmountOut: minimumAmountOut,
        programId: this.programId,
      })
    );
  }

  static async makeSwapOutBySaberStableSwapInstruction({
    sourceTokenKey,
    sourceMint,
    destinationTokenKey,
    destinationMint,
    wallet,
    tokenProgramId = TOKEN_PROGRAM_ID,
    swapInfo,
    feeTokenAccount,
    stableSwapInfo,
    expectAmountOut,
    minimumAmountOut,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMint: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMint: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    swapInfo: PublicKey;
    feeTokenAccount: PublicKey;
    stableSwapInfo: SaberStableSwapInfo;
    expectAmountOut: u64;
    minimumAmountOut: u64;
    programId?: PublicKey
  }): Promise<TransactionInstruction> {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("expectAmountOut"),
      Borsh.u64("minimumAmountOut"),
    ]);

    let dataMap: any = {
      instruction: 17, // Swap instruction
      expectAmountOut: expectAmountOut.toBuffer(),
      minimumAmountOut: minimumAmountOut.toBuffer(),
    };

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: swapInfo, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true }
    ];
    const swapKeys = stableSwapInfo.toKeys(sourceMint);
    keys.push(...swapKeys);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapByRaydiumSwapInstruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      feeTokenAccount,
      amountIn,
      expectAmountOut,
      minimumAmountOut,
      raydiumInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      feeTokenAccount: PublicKey;
      amountIn: u64;
      expectAmountOut: u64;
      minimumAmountOut: u64;
      raydiumInfo: RaydiumAmmInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapByRaydiumSwapInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMint: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMint: toMintKey,
        wallet: wallet,
        tokenProgramId: TOKEN_PROGRAM_ID,
        feeTokenAccount: feeTokenAccount,
        raydiumInfo: raydiumInfo,
        amountIn: amountIn,
        expectAmountOut: expectAmountOut,
        minimumAmountOut: minimumAmountOut,
        programId: this.programId,
      })
    );
  }

  static async makeSwapByRaydiumSwapInstruction({
    sourceTokenKey,
    sourceMint,
    destinationTokenKey,
    destinationMint,
    wallet,
    tokenProgramId = TOKEN_PROGRAM_ID,
    feeTokenAccount,
    raydiumInfo,
    amountIn,
    expectAmountOut,
    minimumAmountOut,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMint: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMint: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    feeTokenAccount: PublicKey;
    raydiumInfo: RaydiumAmmInfo;
    amountIn: u64;
    expectAmountOut: u64;
    minimumAmountOut: u64;
    programId?: PublicKey,
  }): Promise<TransactionInstruction> {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("amountIn"),
      Borsh.u64("expectAmountOut"),
      Borsh.u64("minimumAmountOut"),
    ]);

    let dataMap: any = {
      instruction: 9,
      amountIn: amountIn,
      expectAmountOut: expectAmountOut,
      minimumAmountOut: minimumAmountOut,
    };

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true },
      ...raydiumInfo.toKeys(),
    ];

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapInByRaydiumSwapInstruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      swapInfo,
      amountIn,
      raydiumInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      swapInfo: PublicKey;
      amountIn: u64;
      raydiumInfo: RaydiumAmmInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapInByRaydiumSwapInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMint: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMint: toMintKey,
        wallet: wallet,
        tokenProgramId: TOKEN_PROGRAM_ID,
        swapInfo: swapInfo,
        raydiumInfo: raydiumInfo,
        amountIn: amountIn,
        programId: this.programId,
      })
    );
  }

  static async makeSwapInByRaydiumSwapInstruction({
    sourceTokenKey,
    sourceMint,
    destinationTokenKey,
    destinationMint,
    wallet,
    swapInfo,
    tokenProgramId = TOKEN_PROGRAM_ID,
    raydiumInfo,
    amountIn,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMint: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMint: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    swapInfo: PublicKey;
    raydiumInfo: RaydiumAmmInfo;
    amountIn: u64;
    programId?: PublicKey,
  }): Promise<TransactionInstruction> {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("amountIn"),
    ]);

    let dataMap: any = {
      instruction: 18,
      amountIn: amountIn,
    };

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: swapInfo, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      ...raydiumInfo.toKeys(),
    ];

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapOutByRaydiumSwapInstruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      feeTokenAccount,
      swapInfo,
      expectAmountOut,
      minimumAmountOut,
      raydiumInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      feeTokenAccount: PublicKey;
      swapInfo: PublicKey;
      expectAmountOut: u64;
      minimumAmountOut: u64;
      raydiumInfo: RaydiumAmmInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapOutByRaydiumSwapInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMint: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMint: toMintKey,
        wallet: wallet,
        tokenProgramId: TOKEN_PROGRAM_ID,
        feeTokenAccount: feeTokenAccount,
        swapInfo: swapInfo,
        raydiumInfo: raydiumInfo,
        expectAmountOut: expectAmountOut,
        minimumAmountOut: minimumAmountOut,
        programId: this.programId,
      })
    );
  }

  static async makeSwapOutByRaydiumSwapInstruction({
    sourceTokenKey,
    sourceMint,
    destinationTokenKey,
    destinationMint,
    wallet,
    tokenProgramId = TOKEN_PROGRAM_ID,
    feeTokenAccount,
    swapInfo,
    raydiumInfo,
    expectAmountOut,
    minimumAmountOut,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMint: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMint: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    feeTokenAccount: PublicKey;
    swapInfo: PublicKey;
    raydiumInfo: RaydiumAmmInfo;
    expectAmountOut: u64;
    minimumAmountOut: u64;
    programId?: PublicKey,
  }): Promise<TransactionInstruction> {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("expectAmountOut"),
      Borsh.u64("minimumAmountOut"),
    ]);

    let dataMap: any = {
      instruction: 19,
      expectAmountOut: expectAmountOut,
      minimumAmountOut: minimumAmountOut,
    };

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: swapInfo, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true },
      ...raydiumInfo.toKeys(),
    ];

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapInByRaydiumSwap2Instruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      swapInfo,
      amountIn,
      raydiumInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      swapInfo: PublicKey;
      amountIn: u64;
      raydiumInfo: RaydiumAmmInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapInByRaydiumSwap2Instruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMint: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMint: toMintKey,
        wallet: wallet,
        tokenProgramId: TOKEN_PROGRAM_ID,
        swapInfo: swapInfo,
        raydiumInfo: raydiumInfo,
        amountIn: amountIn,
        programId: this.programId,
      })
    );
  }

  static async makeSwapInByRaydiumSwap2Instruction({
    sourceTokenKey,
    sourceMint,
    destinationTokenKey,
    destinationMint,
    wallet,
    swapInfo,
    tokenProgramId = TOKEN_PROGRAM_ID,
    raydiumInfo,
    amountIn,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMint: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMint: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    swapInfo: PublicKey;
    raydiumInfo: RaydiumAmmInfo;
    amountIn: u64;
    programId?: PublicKey,
  }): Promise<TransactionInstruction> {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("amountIn"),
    ]);

    let dataMap: any = {
      instruction: 20,
      amountIn: amountIn,
    };

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: swapInfo, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      ...raydiumInfo.toKeys2(),
    ];

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapOutByRaydiumSwap2Instruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      feeTokenAccount,
      swapInfo,
      expectAmountOut,
      minimumAmountOut,
      raydiumInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      feeTokenAccount: PublicKey;
      swapInfo: PublicKey;
      expectAmountOut: u64;
      minimumAmountOut: u64;
      raydiumInfo: RaydiumAmmInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapOutByRaydiumSwap2Instruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMint: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMint: toMintKey,
        wallet: wallet,
        tokenProgramId: TOKEN_PROGRAM_ID,
        feeTokenAccount: feeTokenAccount,
        swapInfo: swapInfo,
        raydiumInfo: raydiumInfo,
        expectAmountOut: expectAmountOut,
        minimumAmountOut: minimumAmountOut,
        programId: this.programId,
      })
    );
  }

  static async makeSwapOutByRaydiumSwap2Instruction({
    sourceTokenKey,
    sourceMint,
    destinationTokenKey,
    destinationMint,
    wallet,
    tokenProgramId = TOKEN_PROGRAM_ID,
    feeTokenAccount,
    swapInfo,
    raydiumInfo,
    expectAmountOut,
    minimumAmountOut,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMint: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMint: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    feeTokenAccount: PublicKey;
    swapInfo: PublicKey;
    raydiumInfo: RaydiumAmmInfo;
    expectAmountOut: u64;
    minimumAmountOut: u64;
    programId?: PublicKey,
  }): Promise<TransactionInstruction> {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("minimumAmountOut"),
    ]);

    let dataMap: any = {
      instruction: 21,
      minimumAmountOut: minimumAmountOut,
    };

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: swapInfo, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true },
      ...raydiumInfo.toKeys2(),
    ];

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(dataMap, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapBySerumDexInstruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      feeTokenAccount,
      amountIn,
      expectAmountOut,
      minimumAmountOut,
      openOrders,
      dexMarketInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      feeTokenAccount: PublicKey,
      amountIn: u64;
      expectAmountOut: u64;
      minimumAmountOut: u64;
      openOrders: PublicKey,
      dexMarketInfo: SerumDexMarketInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapBySerumDexInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMintKey: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMintKey: toMintKey,
        wallet: wallet,
        feeTokenAccount: feeTokenAccount,
        tokenProgramId: TOKEN_PROGRAM_ID,
        dexMarketInfo,
        amountIn: amountIn,
        expectAmountOut,
        minimumAmountOut,
        openOrders,
        programId: this.programId,
      })
    );
  }

  static async makeSwapBySerumDexInstruction({
    sourceTokenKey,
    sourceMintKey,
    destinationTokenKey,
    destinationMintKey,
    feeTokenAccount,
    wallet,
    tokenProgramId = TOKEN_PROGRAM_ID,
    openOrders,
    dexMarketInfo,
    amountIn,
    expectAmountOut,
    minimumAmountOut,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMintKey: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMintKey: PublicKey;
    feeTokenAccount: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    openOrders: PublicKey;
    dexMarketInfo: SerumDexMarketInfo;
    amountIn: u64;
    expectAmountOut: u64;
    minimumAmountOut: u64;
    programId?: PublicKey,
  }): Promise<TransactionInstruction> {
    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true },
      ...dexMarketInfo.toKeys(openOrders),
    ];

    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("amountIn"),
      Borsh.u64("expectAmountOut"),
      Borsh.u64("minimumAmountOut"),
    ]);
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({
      instruction: 4,
      amountIn: amountIn,
      expectAmountOut: expectAmountOut,
      minimumAmountOut: minimumAmountOut,
    }, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapInBySerumDexInstruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      swapInfo,
      amountIn,
      openOrders,
      dexMarketInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      swapInfo: PublicKey,
      wallet: PublicKey;
      amountIn: u64;
      openOrders: PublicKey;
      dexMarketInfo: SerumDexMarketInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapInBySerumDexInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMintKey: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMintKey: toMintKey,
        wallet: wallet,
        openOrders,
        swapInfo: swapInfo,
        tokenProgramId: TOKEN_PROGRAM_ID,
        dexMarketInfo,
        amountIn: amountIn,
        programId: this.programId,
      })
    );
  }

  static async makeSwapInBySerumDexInstruction({
    sourceTokenKey,
    sourceMintKey,
    destinationTokenKey,
    destinationMintKey,
    swapInfo,
    wallet,
    tokenProgramId = TOKEN_PROGRAM_ID,
    openOrders,
    dexMarketInfo,
    amountIn,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMintKey: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMintKey: PublicKey;
    swapInfo: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    openOrders: PublicKey;
    dexMarketInfo: SerumDexMarketInfo;
    amountIn: u64;
    programId?: PublicKey,
  }): Promise<TransactionInstruction> {

    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: swapInfo, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      ...dexMarketInfo.toKeys(openOrders),
    ];

    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("amountIn"),
    ]);
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({
      instruction: 14,
      amountIn: amountIn,
    }, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }

  async createSwapOutBySerumDexInstruction(
    {
      fromTokenAccountKey,
      toTokenAccountKey,
      fromMintKey,
      toMintKey,
      wallet,
      swapInfo,
      feeTokenAccount,
      expectAmountOut,
      minimumAmountOut,
      openOrders,
      dexMarketInfo,
      instructions,
      signers,
    }: {
      fromTokenAccountKey: PublicKey;
      toTokenAccountKey: PublicKey;
      fromMintKey: PublicKey;
      toMintKey: PublicKey;
      wallet: PublicKey;
      feeTokenAccount: PublicKey,
      swapInfo: PublicKey,
      expectAmountOut: u64;
      minimumAmountOut: u64;
      openOrders: PublicKey;
      dexMarketInfo: SerumDexMarketInfo;
      instructions: TransactionInstruction[],
      signers: Signer[],
    },
  ): Promise<void> {
    instructions.push(
      await OnesolProtocol.makeSwapOutBySerumDexInstruction({
        sourceTokenKey: fromTokenAccountKey,
        sourceMintKey: fromMintKey,
        destinationTokenKey: toTokenAccountKey,
        destinationMintKey: toMintKey,
        wallet: wallet,
        feeTokenAccount: feeTokenAccount,
        tokenProgramId: TOKEN_PROGRAM_ID,
        swapInfo: swapInfo,
        openOrders,
        dexMarketInfo,
        expectAmountOut,
        minimumAmountOut,
        programId: this.programId,
      })
    );
  }

  static async makeSwapOutBySerumDexInstruction({
    sourceTokenKey,
    sourceMintKey,
    destinationTokenKey,
    destinationMintKey,
    feeTokenAccount,
    wallet,
    swapInfo,
    tokenProgramId = TOKEN_PROGRAM_ID,
    openOrders,
    dexMarketInfo,
    expectAmountOut,
    minimumAmountOut,
    programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    sourceTokenKey: PublicKey;
    sourceMintKey: PublicKey;
    destinationTokenKey: PublicKey;
    destinationMintKey: PublicKey;
    feeTokenAccount: PublicKey;
    wallet: PublicKey;
    tokenProgramId?: PublicKey;
    swapInfo: PublicKey;
    openOrders: PublicKey;
    dexMarketInfo: SerumDexMarketInfo;
    expectAmountOut: u64;
    minimumAmountOut: u64;
    programId?: PublicKey,
  }): Promise<TransactionInstruction> {
    const keys = [
      { pubkey: sourceTokenKey, isSigner: false, isWritable: true },
      { pubkey: destinationTokenKey, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: false },
      { pubkey: swapInfo, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true },
      ...dexMarketInfo.toKeys(openOrders),
    ];

    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("instruction"),
      Borsh.u64("expectAmountOut"),
      Borsh.u64("minimumAmountOut"),
    ]);
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({
      instruction: 15,
      expectAmountOut: expectAmountOut,
      minimumAmountOut: minimumAmountOut,
    }, data);

    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    });
  }
}
