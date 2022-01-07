import {
  Layout as LayoutCls,
  blob,
} from '@solana/buffer-layout';
import {
  PublicKey
} from '@solana/web3.js';
import BN from 'bn.js';
export {
  u8,
} from '@solana/buffer-layout'

export interface Layout<T> {
  span: number;
  property?: string;

  decode(b: Buffer, offset?: number): T;

  encode(src: T, b: Buffer, offset?: number): number;

  getSpan(b: Buffer, offset?: number): number;

  replicate(name: string): this;
}

export class BNLayout extends LayoutCls {
  blob: Layout<Buffer>;
  signed: boolean;

  constructor(span: number, signed: boolean, property?: string) {
    super(span, property);
    this.blob = blob(span);
    this.signed = signed;
  }

  decode(b: Buffer, offset = 0) {
    const num = new BN(this.blob.decode(b, offset), 10, 'le');
    if (this.signed) {
      return num.fromTwos(this.span * 8).clone();
    }
    return num;
  }

  encode(src: BN, b: Buffer, offset = 0) {
    if (this.signed) {
      src = src.toTwos(this.span * 8);
    }
    return this.blob.encode(
      src.toArrayLike(Buffer, 'le', this.span),
      b,
      offset,
    );
  }
}

export function u64(property?: string): BNLayout {
  return new BNLayout(8, false, property);
}

export function i64(property?: string): BNLayout {
  return new BNLayout(8, true, property);
}

export function u128(property?: string): BNLayout {
  return new BNLayout(16, false, property);
}

export function i128(property?: string): BNLayout {
  return new BNLayout(16, true, property);
}

class WrappedLayout<T, U> extends LayoutCls {
  layout: Layout<T>;
  decoder: (data: T) => U;
  encoder: (src: U) => T;

  constructor(
    layout: Layout<T>,
    decoder: (data: T) => U,
    encoder: (src: U) => T,
    property?: string,
  ) {
    super(layout.span, property);
    this.layout = layout;
    this.decoder = decoder;
    this.encoder = encoder;
  }

  decode(b: Buffer, offset?: number): U {
    return this.decoder(this.layout.decode(b, offset));
  }

  encode(src: U, b: Buffer, offset?: number): number {
    return this.layout.encode(this.encoder(src), b, offset);
  }

  getSpan(b: Buffer, offset?: number): number {
    return this.layout.getSpan(b, offset);
  }
}

export function publicKey(property?: string): WrappedLayout<Buffer, PublicKey> {
  return new WrappedLayout(
    blob(32),
    (b: Buffer) => new PublicKey(b),
    (key: PublicKey) => key.toBuffer(),
    property,
  );
}
