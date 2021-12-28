import * as Borsh from '@project-serum/borsh'
import * as BufferLayout from 'buffer-layout';
import {
  u64
} from '@solana/spl-token';
import {
  PublicKey,
  AccountMeta,
  Connection,
} from '@solana/web3.js'
import {
  RAYDIUN_V4_PROGRAM_ID,
} from '../const';
import {
  SerumDexMarketInfo
} from './serum'

// Raydium AmmInfo
export const RaydiumLiquidityStateLayout = BufferLayout.struct([
  Borsh.u64("status"),
  Borsh.u64("nonce"),
  Borsh.u64("maxOrder"),
  Borsh.u64("depth"),
  Borsh.u64("baseDecimal"),
  Borsh.u64("quoteDecimal"),
  Borsh.u64("state"),
  Borsh.u64("resetFlag"),
  Borsh.u64("minSize"),
  Borsh.u64("volMaxCutRatio"),
  Borsh.u64("amountWaveRatio"),
  Borsh.u64("baseLotSize"),
  Borsh.u64("quoteLotSize"),
  Borsh.u64("minPriceMultiplier"),
  Borsh.u64("maxPriceMultiplier"),
  Borsh.u64("systemDecimalValue"),
  Borsh.u64("minSeparateNumerator"),
  Borsh.u64("minSeparateDenominator"),
  Borsh.u64("tradeFeeNumerator"),
  Borsh.u64("tradeFeeDenominator"),
  Borsh.u64("pnlNumerator"),
  Borsh.u64("pnlDenominator"),
  Borsh.u64("swapFeeNumerator"),
  Borsh.u64("swapFeeDenominator"),
  Borsh.u64("baseNeedTakePnl"),
  Borsh.u64("quoteNeedTakePnl"),
  Borsh.u64("quoteTotalPnl"),
  Borsh.u64("baseTotalPnl"),
  BufferLayout.blob(16, "quoteTotalDeposited"),
  BufferLayout.blob(16, "baseTotalDeposited"),
  BufferLayout.blob(16, "swapBaseInAmount"),
  BufferLayout.blob(16, "swapQuoteOutAmount"),
  Borsh.u64("swapBase2QuoteFee"),
  BufferLayout.blob(16, "swapQuoteInAmount"),
  BufferLayout.blob(16, "swapBaseOutAmount"),
  Borsh.u64("swapQuote2BaseFee"),
  // amm vault
  Borsh.publicKey("baseVault"),
  Borsh.publicKey("quoteVault"),
  // mint
  Borsh.publicKey("baseMint"),
  Borsh.publicKey("quoteMint"),
  Borsh.publicKey("lpMint"),
  // market
  Borsh.publicKey("openOrders"),
  Borsh.publicKey("marketId"),
  Borsh.publicKey("marketProgramId"),
  Borsh.publicKey("targetOrders"),
  Borsh.publicKey("withdrawQueue"),
  Borsh.publicKey("tempLpVault"),
  Borsh.publicKey("owner"),
  Borsh.publicKey("pnlOwner"),
]);

export class RaydiumAmmInfo {
  constructor(
    public programId: PublicKey,
    public ammInfo: PublicKey,
    public authority: PublicKey,
    public ammOpenOrders: PublicKey,
    public ammTargetOrders: PublicKey,
    public poolCoinTokenAccount: PublicKey,
    public poolPcTokenAccount: PublicKey,
    public serumProgramId: PublicKey,
    public serumMarket: PublicKey,
    public serumBids: PublicKey,
    public serumAsks: PublicKey,
    public serumEventQueue: PublicKey,
    public serumCoinVaultAccount: PublicKey,
    public serumPcVaultAccount: PublicKey,
    public serumVaultSigner: PublicKey,
  ) {
    this.programId = programId;
    this.ammInfo = ammInfo;
    this.authority = authority;
    this.ammOpenOrders = ammOpenOrders;
    this.ammTargetOrders = ammTargetOrders;
    this.poolCoinTokenAccount = poolCoinTokenAccount;
    this.poolPcTokenAccount = poolPcTokenAccount;
    this.serumProgramId = serumProgramId;
    this.serumMarket = serumMarket;
    this.serumBids = serumBids;
    this.serumAsks = serumAsks;
    this.serumEventQueue = serumEventQueue;
    this.serumCoinVaultAccount = serumCoinVaultAccount;
    this.serumPcVaultAccount = serumPcVaultAccount;
    this.serumVaultSigner = serumVaultSigner;
  }

  toKeys(): Array<AccountMeta> {
    const keys = [
      { pubkey: this.ammInfo, isSigner: false, isWritable: true },
      { pubkey: this.authority, isSigner: false, isWritable: false },
      { pubkey: this.ammOpenOrders, isSigner: false, isWritable: true },
      { pubkey: this.ammTargetOrders, isSigner: false, isWritable: true },
      { pubkey: this.poolCoinTokenAccount, isSigner: false, isWritable: true },
      { pubkey: this.poolPcTokenAccount, isSigner: false, isWritable: true },
      { pubkey: this.serumProgramId, isSigner: false, isWritable: false },
      { pubkey: this.serumMarket, isSigner: false, isWritable: true },
      { pubkey: this.serumBids, isSigner: false, isWritable: true },
      { pubkey: this.serumAsks, isSigner: false, isWritable: true },
      { pubkey: this.serumEventQueue, isSigner: false, isWritable: true },
      { pubkey: this.serumCoinVaultAccount, isSigner: false, isWritable: true },
      { pubkey: this.serumPcVaultAccount, isSigner: false, isWritable: true },
      { pubkey: this.serumVaultSigner, isSigner: false, isWritable: false },
      { pubkey: this.programId, isSigner: false, isWritable: false },
    ];
    return keys;
  }

  toKeys2(): Array<AccountMeta> {
    const keys = [
      { pubkey: this.ammInfo, isSigner: false, isWritable: true },
      { pubkey: this.authority, isSigner: false, isWritable: false },
      { pubkey: this.ammOpenOrders, isSigner: false, isWritable: true },
      { pubkey: this.poolCoinTokenAccount, isSigner: false, isWritable: true },
      { pubkey: this.poolPcTokenAccount, isSigner: false, isWritable: true },
      { pubkey: this.serumProgramId, isSigner: false, isWritable: false },
      { pubkey: this.serumMarket, isSigner: false, isWritable: true },
      { pubkey: this.serumBids, isSigner: false, isWritable: true },
      { pubkey: this.serumAsks, isSigner: false, isWritable: true },
      { pubkey: this.serumEventQueue, isSigner: false, isWritable: true },
      { pubkey: this.serumCoinVaultAccount, isSigner: false, isWritable: true },
      { pubkey: this.serumPcVaultAccount, isSigner: false, isWritable: true },
      { pubkey: this.serumVaultSigner, isSigner: false, isWritable: false },
      { pubkey: this.programId, isSigner: false, isWritable: false },
    ];
    return keys;
  }

  public static async load(
    {
      connection,
      address,
      programId = RAYDIUN_V4_PROGRAM_ID,
    }: {
      connection: Connection;
      address: PublicKey,
      programId?: PublicKey,
    }
  ): Promise<RaydiumAmmInfo | null> {
    const accountInfo = await connection.getAccountInfo(address);
    if (!accountInfo) {
      return null
    }
    const decoded: any = RaydiumLiquidityStateLayout.decode(accountInfo.data);
  
    // this from raydium-sdk src/liquidity/liquidity.ts:getAuthority()
    const [authority, _] = await PublicKey.findProgramAddress(
      [Buffer.from([97, 109, 109, 32, 97, 117, 116, 104, 111, 114, 105, 116, 121])],
      programId
    );
  
    const serumMarketProgramId: PublicKey = decoded.marketProgramId;
    const serumMarket: PublicKey = decoded.marketId;
    const marketInfo = await SerumDexMarketInfo.load({
      connection,
      programId: serumMarketProgramId,
      address: serumMarket,
    });
    if (!marketInfo) {
      return null
    }
  
    return new RaydiumAmmInfo(
      programId,
      address,
      authority,
      decoded.openOrders,
      decoded.targetOrders,
      decoded.baseVault,
      decoded.quoteVault,
      serumMarketProgramId,
      serumMarket,
      marketInfo.bids,
      marketInfo.asks,
      marketInfo.eventQueue,
      marketInfo.coinVault,
      marketInfo.pcVault,
      marketInfo.vaultSigner,
    );
  }
  
}