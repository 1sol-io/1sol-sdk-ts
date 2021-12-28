import * as Borsh from '@project-serum/borsh'
import * as BufferLayout from 'buffer-layout';
import {
  u64
} from '@solana/spl-token';
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
export const FeesLayout = BufferLayout.struct<RawFees>(
  [
    Borsh.u64("adminTradeFeeNumerator"),
    Borsh.u64("adminTradeFeeDenominator"),
    Borsh.u64("adminWithdrawFeeNumerator"),
    Borsh.u64("adminWithdrawFeeDenominator"),
    Borsh.u64("tradeFeeNumerator"),
    Borsh.u64("tradeFeeDenominator"),
    Borsh.u64("withdrawFeeNumerator"),
    Borsh.u64("withdrawFeeDenominator"),
  ],
  "fees"
);

/**
 * Layout for stable swap state
 */
 export const StableSwapLayout = BufferLayout.struct<{
  isInitialized: 0 | 1;
  isPaused: 0 | 1;
  nonce: number;
  initialAmpFactor: u64;
  targetAmpFactor: u64;
  startRampTs: number;
  stopRampTs: number;
  futureAdminDeadline: number;
  futureAdminAccount: PublicKey;
  adminAccount: PublicKey;
  tokenAccountA: PublicKey;
  tokenAccountB: PublicKey;
  tokenPool: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  adminFeeAccountA: PublicKey;
  adminFeeAccountB: PublicKey;
  fees: RawFees;
}>([
  BufferLayout.u8("isInitialized"),
  BufferLayout.u8("isPaused"),
  BufferLayout.u8("nonce"),
  Borsh.u64("initialAmpFactor"),
  Borsh.u64("targetAmpFactor"),
  BufferLayout.ns64("startRampTs"),
  BufferLayout.ns64("stopRampTs"),
  BufferLayout.ns64("futureAdminDeadline"),
  Borsh.publicKey("futureAdminAccount"),
  Borsh.publicKey("adminAccount"),
  Borsh.publicKey("tokenAccountA"),
  Borsh.publicKey("tokenAccountB"),
  Borsh.publicKey("tokenPool"),
  Borsh.publicKey("mintA"),
  Borsh.publicKey("mintB"),
  Borsh.publicKey("adminFeeAccountA"),
  Borsh.publicKey("adminFeeAccountB"),
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
