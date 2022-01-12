# Onesol SDK

[![npm version](https://badge.fury.io/js/@onesol%2Fonesol-sdk.svg)](https://badge.fury.io/js/@onesol%2Fonesol-sdk)

Onesol SDK is designed to be easier to use.

> Getting routes for a given token pair, <br/>
> composing instructions and signers for one route, <br />
> excuting transactions, <br />
> and then it's all done.

<br />

## Usage

### → STEP #0

Install

```typescript
yarn add @onesol/onesol-sdk
```

### → STEP #1

Load OnesolProtocol instance

```typescript
import {
  Connection,
} from "@solana/web3.js";

const SOLANA_RPC_ENDPOINT = 'https://mainnet.rpcpool.com'
const connection = new Connection()

const onesolProtocol = new OnesolProtocol(connection)
```

### → STEP #2

Get supported token list

```typescript
import {
  TokenInfo
} from '@onesol/onesol-sdk'

// export interface TokenInfo {
//   readonly chainId: number;
//   readonly address: string;
//   readonly name: string;
//   readonly decimals: number;
//   readonly symbol: string;
//   readonly logoURI?: string;
//   readonly tags?: string[];
//   readonly extensions?: TokenExtensions;
//   readonly feeAccount?: string
// }

const tokenList: TokenInfo[] = await onesolProtocol.getTokenList()
```

### → STEP #3

Get routes form a given token pair

```typescript
import {
  Route,
} from '@onesol/onesol-sdk'

// interface Route {
//   id: string,
//   routes: RawRoute[][],
//   split_tx: boolean,
//   destination_token_mint: {
//     decimals: number,
//     pubkey: string
//   },
//   source_token_mint: {
//     decimals: number,
//     pubkey: string
//   },
//   amount_in: number,
//   amount_out: number,
//   exchanger_flag: string,
// }

const routes: Route[] = await onesolProtocol.getRoutes({
  amount: number, // amount of the input token(should be with input token decimail) e.g `10 * 10 ** 6`,
  sourceMintAddress: string, // mint address of the input token
  destinationMintAddress: string, // mint address of the output token
  signal: AbortSignal // [AbortController](https://developer.mozilla.org/zh-CN/docs/Web/API/AbortController) signal, if needed, it can be used to abort the fetch request
})
```

 ### → STEP #4

Compose instructions and signers for transactions

```typescript
import { Signer, TransactionInstruction } from '@solana/web3.js'
import {
  Route,
  TokenAccountInfo,
} from '@onesol/onesol-sdk'

// type TokenAccountInfo = {
//   pubkey: PublicKey | null,
//   mint: PublicKey,
//   owner: PublicKey;
//   amount: u64
// }

// instructions and signers for transactions
// according to different route, there will be one or several transactions
// for example
// directing route like USDC-1SOL may need one transaction to swap
// indirecting route like ETH-USDC-1SOL may need several transactions to swap
const setupInstructions: TransactionInstruction[] = [];
const setupSigners: Signer[] = [];
const swapInstructions: TransactionInstruction[] = [];
const swapSigners: Signer[] = [];
const cleanupInstructions: TransactionInstruction[] = [];
const cleanupSigners: Signer[] = [];

await composeInstructions({
  route: Route, //one route from the results of the `getRoutes`
  walletAddress: PublicKey, // wallet public key
  fromTokenAccount: {
    pubkey, // public key of input token account
    mint, // public key of input token-mint
    owner, // wallet public key
  }: TokenAccountInfo, // input token account info
  toTokenAccount: TokenAccountInfo, // output token account info
  setupInstructions,
  setupSigners,
  swapInstructions,
  swapSigners,
  cleanupInstructions,
  cleanupSigners,
  slippage: number, //default is 0.005
})
```

### → STEP #5

Make transactions and excute swap

With the instructions and signers from last step, transactions can now be signed and sent.

<br />

## Code in action

1. [React Hook](https://github.com/1sol-io/1sol-interface/blob/bc7fc25afe789c5c2d0c306f1e30e81bdf27f86e/src/context/onesolprotocol.tsx)
2. [Get Routes](https://github.com/1sol-io/1sol-interface/blob/bc7fc25afe789c5c2d0c306f1e30e81bdf27f86e/src/components/trade/index.tsx#L143-L147)
3. [Compose instructions and signers](https://github.com/1sol-io/1sol-interface/blob/bc7fc25afe789c5c2d0c306f1e30e81bdf27f86e/src/components/trade/index.tsx#L302-L329)
4. [Sign and send transactions](https://github.com/1sol-io/1sol-interface/blob/bc7fc25afe789c5c2d0c306f1e30e81bdf27f86e/src/utils/pools.tsx#L186-L286)
