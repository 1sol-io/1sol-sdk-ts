import * as Layout from '../layout'
import * as BufferLayout from '@solana/buffer-layout';
import {
  u64
} from './index';
import {
  PublicKey,
  AccountMeta,
  SYSVAR_RENT_PUBKEY,
  Connection,
  AccountInfo,
  TransactionInstruction,
} from '@solana/web3.js'
import BN from 'bn.js';
import {
  SERUM_PROGRAM_ID
} from '../const';

export class WideBits extends BufferLayout.Layout {
  private _lower: any;
  private _upper: any;

  constructor(property?: string) {
    super(8, property);
    this._lower = BufferLayout.bits(BufferLayout.u32(), false);
    this._upper = BufferLayout.bits(BufferLayout.u32(), false);
  }

  addBoolean(property: string) {
    if (this._lower.fields.length < 32) {
      this._lower.addBoolean(property);
    } else {
      this._upper.addBoolean(property);
    }
  }

  decode(b: Buffer, offset = 0) {
    const lowerDecoded = this._lower.decode(b, offset);
    const upperDecoded = this._upper.decode(b, offset + this._lower.span);
    return { ...lowerDecoded, ...upperDecoded };
  }

  encode(src: any, b: Buffer, offset = 0) {
    return (
      this._lower.encode(src, b, offset) +
      this._upper.encode(src, b, offset + this._lower.span)
    );
  }
}

const ACCOUNT_FLAGS_LAYOUT = new WideBits();

ACCOUNT_FLAGS_LAYOUT.addBoolean('initialized');
ACCOUNT_FLAGS_LAYOUT.addBoolean('market');
ACCOUNT_FLAGS_LAYOUT.addBoolean('openOrders');
ACCOUNT_FLAGS_LAYOUT.addBoolean('requestQueue');
ACCOUNT_FLAGS_LAYOUT.addBoolean('eventQueue');
ACCOUNT_FLAGS_LAYOUT.addBoolean('bids');
ACCOUNT_FLAGS_LAYOUT.addBoolean('asks');


export function accountFlagsLayout(property = 'accountFlags') {
  return ACCOUNT_FLAGS_LAYOUT.replicate(property);
}

export const SERUM_MARKET_STATE_LAYOUT_V2 = BufferLayout.struct([
  BufferLayout.blob(5),
  accountFlagsLayout('accountFlags'),
  Layout.publicKey('ownAddress'),
  Layout.u64('vaultSignerNonce'),
  Layout.publicKey('baseMint'),
  Layout.publicKey('quoteMint'),
  Layout.publicKey('baseVault'),
  Layout.u64('baseDepositsTotal'),
  Layout.u64('baseFeesAccrued'),
  Layout.publicKey('quoteVault'),
  Layout.u64('quoteDepositsTotal'),
  Layout.u64('quoteFeesAccrued'),
  Layout.u64('quoteDustThreshold'),
  Layout.publicKey('requestQueue'),
  Layout.publicKey('eventQueue'),
  Layout.publicKey('bids'),
  Layout.publicKey('asks'),
  Layout.u64('baseLotSize'),
  Layout.u64('quoteLotSize'),
  Layout.u64('feeRateBps'),
  Layout.u64('referrerRebatesAccrued'),
  BufferLayout.blob(7),
]);

export const SERUM_OPEN_ORDERS_LAYOUT_V2 = BufferLayout.struct([
  BufferLayout.blob(5),
  accountFlagsLayout('accountFlags'),
  Layout.publicKey('market'),
  Layout.publicKey('owner'),

  // These are in spl-token (i.e. not lot) units
  Layout.u64('baseTokenFree'),
  Layout.u64('baseTokenTotal'),
  Layout.u64('quoteTokenFree'),
  Layout.u64('quoteTokenTotal'),
  Layout.u128('freeSlotBits'),
  Layout.u128('isBidBits'),
  BufferLayout.blob(2048, 'orders'),
  BufferLayout.blob(1024, 'orders'),
  Layout.u64('referrerRebatesAccrued'),
  BufferLayout.blob(7),
]);

export class SerumDexMarketInfo {
  constructor(
    public market: PublicKey,
    public requestQueue: PublicKey,
    public eventQueue: PublicKey,
    public bids: PublicKey,
    public asks: PublicKey,
    public coinVault: PublicKey,
    public pcVault: PublicKey,
    public vaultSigner: PublicKey,
    public vaultSignerNonce: number,
    public programId: PublicKey
  ) {
    this.market = market;
    this.requestQueue = requestQueue;
    this.eventQueue = eventQueue;
    this.bids = bids;
    this.asks = asks;
    this.coinVault = coinVault;
    this.pcVault = pcVault;
    this.vaultSigner = vaultSigner;
    this.vaultSignerNonce = vaultSignerNonce;
    this.programId = programId;
  }

  toKeys(openOrders: PublicKey): Array<AccountMeta> {
    const keys = [
      { pubkey: openOrders, isSigner: false, isWritable: true },
      { pubkey: this.market, isSigner: false, isWritable: true },
      {
        pubkey: this.requestQueue,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: this.eventQueue,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: this.bids, isSigner: false, isWritable: true },
      { pubkey: this.asks, isSigner: false, isWritable: true },
      {
        pubkey: this.coinVault,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: this.pcVault,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: this.vaultSigner, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: this.programId, isSigner: false, isWritable: false },
    ];
    return keys;
  }

  public static async load(
    {
      connection,
      address,
      programId = SERUM_PROGRAM_ID,
    }: {
      connection: Connection;
      address: PublicKey,
      programId?: PublicKey,
    }
  ): Promise<SerumDexMarketInfo | null> {
    const accountInfo = await connection.getAccountInfo(address)
    if (!accountInfo) {
      return null
    }
    const decoded = SERUM_MARKET_STATE_LAYOUT_V2.decode(accountInfo.data);
    const requestQueue = decoded.requestQueue;
    const eventQueue = decoded.eventQueue;
    const bids = decoded.bids;
    const asks = decoded.asks;
    const coinVault = decoded.baseVault;
    const pcVault = decoded.quoteVault;
    const vaultSignerNonce = decoded.vaultSignerNonce;

    const vaultSigner = await PublicKey.createProgramAddress(
      [address.toBuffer()].concat(vaultSignerNonce.toArrayLike(Buffer, "le", 8)),
      programId
    );

    return new SerumDexMarketInfo(
      address,
      requestQueue,
      eventQueue,
      bids,
      asks,
      coinVault,
      pcVault,
      vaultSigner,
      vaultSignerNonce,
      programId
    );
  }
}

export class SerumDexOpenOrders {
  private _programId: PublicKey;

  public address: PublicKey;
  public market!: PublicKey;
  public owner!: PublicKey;

  public baseTokenFree!: u64;
  public baseTokenTotal!: u64;
  public quoteTokenFree!: u64;
  public quoteTokenTotal!: u64;
  public freeSlotBits!: BN;
  public isBidBits!: BN;

  constructor(address: PublicKey, decoded: any, programId: PublicKey) {
    this.address = address;
    this._programId = programId;
    this.market = decoded.market;
    this.owner = decoded.owner;
    this.baseTokenFree = new u64(decoded.baseTokenFree);
    this.baseTokenTotal = new u64(decoded.baseTokenTotal);
    this.quoteTokenFree = new u64(decoded.quoteTokenFree);
    this.quoteTokenTotal = new u64(decoded.quoteTokenTotal);
    this.freeSlotBits = new BN(decoded.freeSlotBits);
    this.isBidBits = new BN(decoded.freeSlotBits);
  }

  static getLayout() {
    return SERUM_OPEN_ORDERS_LAYOUT_V2;
  }

  static async findForMarketAndOwner(
    connection: Connection,
    marketAddress: PublicKey,
    ownerAddress: PublicKey,
    programId: PublicKey,
  ) {
    const filters = [
      {
        memcmp: {
          offset: this.getLayout().offsetOf('market')!,
          bytes: marketAddress.toBase58(),
        },
      },
      {
        memcmp: {
          offset: this.getLayout().offsetOf('owner')!,
          bytes: ownerAddress.toBase58(),
        },
      },
      {
        dataSize: this.getLayout().span,
      },
    ];
    const accounts = await connection.getProgramAccounts(
      programId,
      { filters },
    );
    return accounts.map(({ pubkey, account }) =>
      SerumDexOpenOrders.fromAccountInfo(pubkey, account, programId),
    );
  }

  static async load(
    connection: Connection,
    address: PublicKey,
    programId: PublicKey,
  ) {
    const accountInfo = await connection.getAccountInfo(address);
    if (accountInfo === null) {
      throw new Error('Open orders account not found');
    }
    return SerumDexOpenOrders.fromAccountInfo(address, accountInfo, programId);
  }

  static fromAccountInfo(
    address: PublicKey,
    accountInfo: AccountInfo<Buffer>,
    programId: PublicKey,
  ) {
    const { owner, data } = accountInfo;
    if (!owner.equals(programId)) {
      throw new Error('Address not owned by program');
    }
    const decoded = this.getLayout().decode(data);
    if (!decoded.accountFlags.initialized || !decoded.accountFlags.openOrders) {
      throw new Error('Invalid open orders account');
    }
    return new SerumDexOpenOrders(address, decoded, programId);
  }

  static initOpenOrdersInstruction(
    {
      openOrders, owner, market, programId
    }:
      {
        openOrders: PublicKey,
        owner: PublicKey,
        market: PublicKey,
        programId: PublicKey
      }
  ) {
    const keys = [
      { pubkey: openOrders, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("version"),
      BufferLayout.u32("instruction"),
    ]);
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({
      version: 0,
      instruction: 15,
    }, data);
    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    })
  }

  static closeOpenOrdersInstruction(
    {
      openOrders, owner, destination, programId, market,
    }:
      {
        openOrders: PublicKey,
        owner: PublicKey,
        destination: PublicKey,
        market: PublicKey,
        programId: PublicKey
      }
  ) {
    const keys = [
      { pubkey: openOrders, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: market, isSigner: false, isWritable: false },
    ];
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8("version"),
      BufferLayout.u32("instruction"),
    ]);
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({
      version: 0,
      instruction: 14,
    }, data);
    return new TransactionInstruction({
      keys,
      programId: programId,
      data,
    })
  }
}
