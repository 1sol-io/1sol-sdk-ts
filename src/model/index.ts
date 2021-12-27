
export {
  SwapInfoLayout,
  AccountStatus,
} from './onesol';
export {
  SaberStableSwapInfo, StableSwapLayout
} from './saber'
export {
  SplTokenSwapInfo, SplTokenSwapLayout,
} from './spl-token-swap'
export {
  SerumDexMarketInfo, SerumDexOpenOrders
} from './serum';
export {
  RaydiumAmmInfo
} from './raydium'

import { BN } from 'bn.js';
import assert from 'assert';

/**
 * 64-bit value
 */
 export class u64 extends BN {
  /**
   * Convert to Buffer representation
   */
  toBuffer(): Buffer {
    const a = super.toArray().reverse();
    const b = Buffer.from(a);
    if (b.length === 8) {
      return b;
    }
    assert(b.length < 8, 'u64 too large');

    const zeroPad = Buffer.alloc(8);
    b.copy(zeroPad);
    return zeroPad;
  }

  /**
   * Construct a u64 from Buffer representation
   */
  static fromBuffer(buffer: Buffer): u64 {
    assert(buffer.length === 8, `Invalid buffer length: ${buffer.length}`);
    return new u64(
      [...buffer]
        .reverse()
        .map(i => `00${i.toString(16)}`.slice(-2))
        .join(''),
      16,
    );
  }
}

