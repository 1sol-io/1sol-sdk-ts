import * as Layout from '../layout'
import * as BufferLayout from '@solana/buffer-layout';
import {
  u64
} from './index';
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
  Layout.u64("status"),
  Layout.u64("nonce"),
  Layout.u64("maxOrder"),
  Layout.u64("depth"),
  Layout.u64("baseDecimal"),
  Layout.u64("quoteDecimal"),
  Layout.u64("state"),
  Layout.u64("resetFlag"),
  Layout.u64("minSize"),
  Layout.u64("volMaxCutRatio"),
  Layout.u64("amountWaveRatio"),
  Layout.u64("baseLotSize"),
  Layout.u64("quoteLotSize"),
  Layout.u64("minPriceMultiplier"),
  Layout.u64("maxPriceMultiplier"),
  Layout.u64("systemDecimalValue"),
  Layout.u64("minSeparateNumerator"),
  Layout.u64("minSeparateDenominator"),
  Layout.u64("tradeFeeNumerator"),
  Layout.u64("tradeFeeDenominator"),
  Layout.u64("pnlNumerator"),
  Layout.u64("pnlDenominator"),
  Layout.u64("swapFeeNumerator"),
  Layout.u64("swapFeeDenominator"),
  Layout.u64("baseNeedTakePnl"),
  Layout.u64("quoteNeedTakePnl"),
  Layout.u64("quoteTotalPnl"),
  Layout.u64("baseTotalPnl"),
  BufferLayout.blob(16, "quoteTotalDeposited"),
  BufferLayout.blob(16, "baseTotalDeposited"),
  BufferLayout.blob(16, "swapBaseInAmount"),
  BufferLayout.blob(16, "swapQuoteOutAmount"),
  Layout.u64("swapBase2QuoteFee"),
  BufferLayout.blob(16, "swapQuoteInAmount"),
  BufferLayout.blob(16, "swapBaseOutAmount"),
  Layout.u64("swapQuote2BaseFee"),
  // amm vault
  Layout.publicKey("baseVault"),
  Layout.publicKey("quoteVault"),
  // mint
  Layout.publicKey("baseMint"),
  Layout.publicKey("quoteMint"),
  Layout.publicKey("lpMint"),
  // market
  Layout.publicKey("openOrders"),
  Layout.publicKey("marketId"),
  Layout.publicKey("marketProgramId"),
  Layout.publicKey("targetOrders"),
  Layout.publicKey("withdrawQueue"),
  Layout.publicKey("tempLpVault"),
  Layout.publicKey("owner"),
  Layout.publicKey("pnlOwner"),
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