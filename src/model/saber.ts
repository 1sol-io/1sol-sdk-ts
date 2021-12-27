import * as Layout from '../layout'
import * as BufferLayout from '@solana/buffer-layout';
import {
  u64
} from './index';
import {
  PublicKey,
  AccountMeta,
  SYSVAR_CLOCK_PUBKEY,
  Connection,
} from '@solana/web3.js'
import {
  SABER_STABLE_SWAP_PROGRAM_ID
} from '../const';

/**
 * Raw representation of fees.
 */
 export interface RawFees {
  adminTradeFeeNumerator: u64;
  adminTradeFeeDenominator: u64;
  adminWithdrawFeeNumerator: u64;
  adminWithdrawFeeDenominator: u64;
  tradeFeeNumerator: u64;
  tradeFeeDenominator: u64;
  withdrawFeeNumerator: u64;
  withdrawFeeDenominator: u64;
}

/**
 * Layout for StableSwap fees
 */
export const FeesLayout = BufferLayout.struct(
  [
    Layout.u64("adminTradeFeeNumerator"),
    Layout.u64("adminTradeFeeDenominator"),
    Layout.u64("adminWithdrawFeeNumerator"),
    Layout.u64("adminWithdrawFeeDenominator"),
    Layout.u64("tradeFeeNumerator"),
    Layout.u64("tradeFeeDenominator"),
    Layout.u64("withdrawFeeNumerator"),
    Layout.u64("withdrawFeeDenominator"),
  ],
  "fees"
);

/**
 * Layout for stable swap state
 */
 export const StableSwapLayout = BufferLayout.struct([
  BufferLayout.u8("isInitialized"),
  BufferLayout.u8("isPaused"),
  BufferLayout.u8("nonce"),
  Layout.u64("initialAmpFactor"),
  Layout.u64("targetAmpFactor"),
  BufferLayout.ns64("startRampTs"),
  BufferLayout.ns64("stopRampTs"),
  BufferLayout.ns64("futureAdminDeadline"),
  Layout.publicKey("futureAdminAccount"),
  Layout.publicKey("adminAccount"),
  Layout.publicKey("tokenAccountA"),
  Layout.publicKey("tokenAccountB"),
  Layout.publicKey("tokenPool"),
  Layout.publicKey("mintA"),
  Layout.publicKey("mintB"),
  Layout.publicKey("adminFeeAccountA"),
  Layout.publicKey("adminFeeAccountB"),
  FeesLayout,
]);

export class SaberStableSwapInfo {
  constructor(
    public programId: PublicKey,
    public swapInfo: PublicKey,
    public authority: PublicKey,
    public tokenAccountA: PublicKey,
    public mintA: PublicKey,
    public adminFeeAccountA: PublicKey,
    public tokenAccountB: PublicKey,
    public mintB: PublicKey,
    public adminFeeAccountB: PublicKey,
  ) {
    this.programId = programId;
    this.swapInfo = swapInfo;
    this.authority = authority;
    this.tokenAccountA = tokenAccountA;
    this.tokenAccountB = tokenAccountB;
    this.adminFeeAccountA = adminFeeAccountA;
    this.adminFeeAccountB = adminFeeAccountB;
  }

  toKeys(sourceMint: PublicKey): Array<AccountMeta> {
    const keys = [
      { pubkey: this.swapInfo, isSigner: false, isWritable: false },
      { pubkey: this.authority, isSigner: false, isWritable: false },
      { pubkey: this.tokenAccountA, isSigner: false, isWritable: true },
      { pubkey: this.tokenAccountB, isSigner: false, isWritable: true },
    ];

    if (sourceMint.equals(this.mintA)) {
      keys.push(
        { pubkey: this.adminFeeAccountB, isSigner: false, isWritable: true },
      );
    } else {
      keys.push(
        { pubkey: this.adminFeeAccountA, isSigner: false, isWritable: true },
      );
    }
    keys.push(
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: this.programId, isSigner: false, isWritable: false },
    );
    return keys;
  }

  public static async load(
    {
      connection,
      address,
      programId = SABER_STABLE_SWAP_PROGRAM_ID,
    }: {
      connection: Connection;
      address: PublicKey,
      programId: PublicKey,
    }
  ): Promise<SaberStableSwapInfo | null> {
  
    const accountInfo = await connection.getAccountInfo(address);
    if (!accountInfo) {
      return null
    }
    const stableSwapData = StableSwapLayout.decode(accountInfo.data);
  
    if (!stableSwapData.isInitialized || stableSwapData.isPaused) {
      return null
    }
  
    const authority = await PublicKey.createProgramAddress(
      [address.toBuffer()].concat(Buffer.from([stableSwapData.nonce])),
      programId
    );
  
    const tokenAccountA = stableSwapData.tokenAccountA;
    const mintA = stableSwapData.mintA;
    const adminFeeAccountA = stableSwapData.adminFeeAccountA;
    const tokenAccountB = stableSwapData.tokenAccountB;
    const mintB = stableSwapData.mintB;
    const adminFeeAccountB = stableSwapData.adminFeeAccountB;
  
    return new SaberStableSwapInfo(
      programId,
      address,
      authority,
      tokenAccountA,
      mintA,
      adminFeeAccountA,
      tokenAccountB,
      mintB,
      adminFeeAccountB
    );
  }
}
