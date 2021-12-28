import * as Borsh from '@project-serum/borsh'
import * as BufferLayout from 'buffer-layout';
import {
  u64
} from '@solana/spl-token';
import BN from 'bn.js';
import {
  PublicKey,
  AccountMeta,
  Connection,
} from '@solana/web3.js'

export const SplTokenSwapLayout = BufferLayout.struct<{
  version: number,
  isInitialized: number,
  bumpSeed: number,
  tokenProgramId: PublicKey,
  tokenAccountA: PublicKey,
  tokenAccountB: PublicKey,
  tokenPool: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  feeAccount: PublicKey,
  tradeFeeNumerator: BN,
  tradeFeeDenominator: BN,
  ownerTradeFeeNumerator: BN,
  ownerTradeFeeDenominator: BN,
  ownerWithdrawFeeNumerator: BN,
  hostFeeNumerator: BN,
  hostFeeDenominator: BN,
  curveType: number,
  curveParameters: Buffer,
}>([
  BufferLayout.u8('version'),
  BufferLayout.u8('isInitialized'),
  BufferLayout.u8('bumpSeed'),
  Borsh.publicKey('tokenProgramId'),
  Borsh.publicKey('tokenAccountA'),
  Borsh.publicKey('tokenAccountB'),
  Borsh.publicKey('tokenPool'),
  Borsh.publicKey('mintA'),
  Borsh.publicKey('mintB'),
  Borsh.publicKey('feeAccount'),
  Borsh.u64('tradeFeeNumerator'),
  Borsh.u64('tradeFeeDenominator'),
  Borsh.u64('ownerTradeFeeNumerator'),
  Borsh.u64('ownerTradeFeeDenominator'),
  Borsh.u64('ownerWithdrawFeeNumerator'),
  Borsh.u64('ownerWithdrawFeeDenominator'),
  Borsh.u64('hostFeeNumerator'),
  Borsh.u64('hostFeeDenominator'),
  BufferLayout.u8('curveType'),
  BufferLayout.blob(32, 'curveParameters'),
]);

export const CurveType = Object.freeze({
  ConstantProduct: 0, // Constant product curve, Uniswap-style
  ConstantPrice: 1, // Constant price curve, always X amount of A token for 1 B token, where X is defined at init
  Offset: 3, // Offset curve, like Uniswap, but with an additional offset on the token B side
});

export class SplTokenSwapInfo {
  constructor(
    public programId: PublicKey,
    public pubkey: PublicKey,
    public authority: PublicKey,
    public tokenAccountA: PublicKey,
    public tokenAccountB: PublicKey,
    public mintA: PublicKey,
    public mintB: PublicKey,
    public poolMint: PublicKey,
    public feeAccount: PublicKey,
  ) {
    this.programId = programId;
    this.pubkey = pubkey;
    this.authority = authority;
    this.tokenAccountA = tokenAccountA;
    this.tokenAccountB = tokenAccountB;
    this.mintA = mintA;
    this.mintB = mintB;
    this.poolMint = poolMint;
    this.feeAccount = feeAccount;
  }

  toKeys(): Array<AccountMeta> {
    const keys = [
      { pubkey: this.pubkey, isSigner: false, isWritable: false },
      { pubkey: this.authority, isSigner: false, isWritable: false },
      { pubkey: this.tokenAccountA, isSigner: false, isWritable: true },
      { pubkey: this.tokenAccountB, isSigner: false, isWritable: true },
      { pubkey: this.poolMint, isSigner: false, isWritable: true },
      { pubkey: this.feeAccount, isSigner: false, isWritable: true },
      { pubkey: this.programId, isSigner: false, isWritable: false },
    ];
    return keys;
  }

  public static async load({
    connection,
    address,
    programId,
  }: {
    connection: Connection,
    address: PublicKey,
    programId: PublicKey,
  }
  ): Promise<SplTokenSwapInfo | null> {
    const info = await connection.getAccountInfo(address);
    if (!info) {
      return null
    }
    const tokenSwapData = SplTokenSwapLayout.decode(info.data);

    if (!tokenSwapData.isInitialized) {
      throw new Error(`Invalid token swap state`);
    }

    const authority = await PublicKey.createProgramAddress(
      [address.toBuffer()].concat(Buffer.from([tokenSwapData.bumpSeed])),
      programId
    );

    const poolMint = tokenSwapData.tokenPool;
    const feeAccount = tokenSwapData.feeAccount;
    const tokenAccountA = tokenSwapData.tokenAccountA;
    const mintA = tokenSwapData.mintA;
    const tokenAccountB = tokenSwapData.tokenAccountB;
    const mintB = tokenSwapData.mintB;

    return new SplTokenSwapInfo(
      programId,
      address,
      authority,
      tokenAccountA,
      tokenAccountB,
      mintA,
      mintB,
      poolMint,
      feeAccount,
    );
  }


}
