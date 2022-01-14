import * as BufferLayout from '@solana/buffer-layout';
import {
  PublicKey,
  AccountMeta,
  Connection,
} from '@solana/web3.js'

import * as Layout from '../layout'

export const SplTokenSwapLayout = BufferLayout.struct([
  BufferLayout.u8('version'),
  BufferLayout.u8('isInitialized'),
  BufferLayout.u8('bumpSeed'),
  Layout.publicKey('tokenProgramId'),
  Layout.publicKey('tokenAccountA'),
  Layout.publicKey('tokenAccountB'),
  Layout.publicKey('tokenPool'),
  Layout.publicKey('mintA'),
  Layout.publicKey('mintB'),
  Layout.publicKey('feeAccount'),
  Layout.u64('tradeFeeNumerator'),
  Layout.u64('tradeFeeDenominator'),
  Layout.u64('ownerTradeFeeNumerator'),
  Layout.u64('ownerTradeFeeDenominator'),
  Layout.u64('ownerWithdrawFeeNumerator'),
  Layout.u64('ownerWithdrawFeeDenominator'),
  Layout.u64('hostFeeNumerator'),
  Layout.u64('hostFeeDenominator'),
  BufferLayout.u8('curveType'),
  BufferLayout.blob(32, 'curveParameters'),
]);

export const CurveType = Object.freeze({
  ConstantProduct: 0, // Constant product curve, Uniswap-style
  ConstantPrice: 1, // Constant price curve, always X amount of A token for 1 B token, where X is defined at init
  Stable: 2, // like uniswap, but with wide zone of 1:1 instead of one point
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
