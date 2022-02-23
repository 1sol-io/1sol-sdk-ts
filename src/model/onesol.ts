import * as Layout from '../layout'
import * as BufferLayout from '@solana/buffer-layout';
import {
  u64,
} from './index';
import {
  PublicKey,
  Connection,
} from '@solana/web3.js'
import {
  ONESOL_PROTOCOL_PROGRAM_ID,
} from '../const'
import bs58 from 'bs58';

// SwapInfo
export const SwapInfoLayout = BufferLayout.struct([
  BufferLayout.u8("isInitialized"),
  BufferLayout.u8("status"),
  Layout.u64("tokenLatestAmount"),
  Layout.publicKey("owner"),
  BufferLayout.u32("tokenAccountOption"),
  BufferLayout.blob(32, "tokenAccount")
]);

export class SwapInfo {
  isInitialized: boolean;
  status: number;
  tokenLatestAmount: u64;
  owner: PublicKey;
  tokenAccount: PublicKey | null;

  private constructor(public pubkey: PublicKey, public programId: PublicKey, private decoded: any) {
    this.isInitialized = decoded.isInitialized == 1;
    this.status = decoded.status;
    this.tokenLatestAmount = new u64(decoded.tokenLatestAmount);
    this.owner = decoded.owner;
    if (decoded.tokenAccountOption === 1) {
      this.tokenAccount = new PublicKey(decoded.tokenAccount);
    } else {
      this.tokenAccount = null
    }
  }

  static async findSwapInfo({
    owner, connection, programId = ONESOL_PROTOCOL_PROGRAM_ID,
  }: {
    owner: PublicKey,
    programId?: PublicKey,
    connection: Connection,
  }): Promise<SwapInfo | null> {
    const [accountItem] = await connection.getProgramAccounts(programId, {
      filters: [
        {
          dataSize: SwapInfoLayout.span,
        },
        {
          memcmp: {
            offset: SwapInfoLayout.offsetOf('isInitialized')!,
            bytes: bs58.encode([1]),
          }
        },
        {
          memcmp: {
            offset: SwapInfoLayout.offsetOf('status')!,
            bytes: bs58.encode([AccountStatus.SwapInfo]),
          }
        },
        {
          memcmp: {
            offset: SwapInfoLayout.offsetOf('owner')!,
            bytes: owner.toBase58(),
          },
        },
      ],
    });

    if (!accountItem) {
      return null
    }
    const { pubkey, account } = accountItem;
    const decoded = SwapInfoLayout.decode(account.data);
    return new SwapInfo(
      pubkey,
      account.owner,
      decoded,
    )
  }
}

export enum AccountStatus {
  SwapInfo = 1,
  Closed = 3,
}
