# Onesol SDK

[![npm version](https://badge.fury.io/js/@onesol%2Fonesol-sdk.svg)](https://badge.fury.io/js/@onesol%2Fonesol-sdk)

Onesol SDK is designed to be easier to use.

> Getting routes for a given token pair, <br/>
> getting transactions for one route, <br />
> signing and excuting transactions, <br />
> then it's all done.

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
  Distribution
} from '@onesol/onesol-sdk'

// interface Distribution {
//   routeType: string,
//   routes: Route[][],
//   destinationTokenMint: {
//     decimals: number,
//     address: string
//   },
//   sourceTokenMint: {
//     decimals: number,
//     address: string
//   },
//   amountIn: number,
//   amountOut: number,
// }

const routes: Distribution[] = await onesolProtocol.getRoutes({
  amount: number, // amount of the input token(should be with input token decimail) e.g `10 * 10 ** 6`,
  sourceTokenMintKey: string, // mint address of the input token
  destinationTokenMintKey: string, // mint address of the output token
  size: number, // number of the result
  signal: AbortSignal // [AbortController](https://developer.mozilla.org/zh-CN/docs/Web/API/AbortController) signal, if needed, it can be used to abort the fetch request
})
```

 ### → STEP #4

Get transactions for one route

```typescript
import { Transaction } from '@solana/web3.js'
import {
  Distribution
} from '@onesol/onesol-sdk'

const transactions: Transaction[] = await onesolProtocol.getTransactions({
  wallet: PublicKey,
  distribution: Distribution, // one distribution from the results of the `getRoutes`
  slippage: number, //default is 0.005
})
```

### → STEP #5

Sign these transactions and excute them to swap.

<br />

## Code in action

[1sol-io/1sol-interface](https://github.com/1sol-io/1sol-interface/tree/feat-mainnet)
