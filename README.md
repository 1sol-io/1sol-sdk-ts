# Onesol SDK

Onesol SDK is designed to be easier to use.

Getting routes for a given token pair, composing instructions and signers for one route, excuting transactions, and then it's all done.

### Usage

1. Install

```typescript
yarn add @onesol/onesol-sdk
```

2. Load OnesolProtocol instance

```typescript
import {
  Connection,
} from "@solana/web3.js";

const SOLANA_RPC_ENDPOINT = 'https://mainnet.rpcpool.com'
const connection = new Connection()

const onesolProtocol = new OnesolProtocol(connection)
```

3. Get supported token list

```typescript
import {
  TokenInfo
} from '@onesol/onesol-sdk/types'

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

4. Get routes form a given token pair

```typescript
import {
  RawDistribution,
} from '@onesol/onesol-sdk/types'

// interface RawDistribution {
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

const routes: RawDistribution[] = await onesolProtocol.getRoutes({
  amount, // amount of the input token(should be with input token decimail),
  sourceMintAddress, // mint address of the input token
  destinationMintAddress, // mint address of the output token
  signal // [AbortController](https://developer.mozilla.org/zh-CN/docs/Web/API/AbortController) signal, if needed, it can be used to abort the fetch request
})
```

5. Compose instructions and signers for transactions

```typescript
import { Signer, TransactionInstruction } from '@solana/web3.js'
import {
  RawDistribution,
  TokenAccountInfo,
} from '@onesol/onesol-sdk/types'

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
  route, // `RawDistribution`, one route from the results of the `getRoutes`
  walletAddress, // wallet public key
  fromTokenAccount: {
    pubkey, // public key of input token account
    mint, // public key of input token-mint
    owner, // wallet public key
  }, // `TokenAccountInfo`, input token account info
  toTokenAccount, // `TokenAccountInfo`, output token account info
  setupInstructions,
  setupSigners,
  swapInstructions,
  swapSigners,
  cleanupInstructions,
  cleanupSigners,
  slippage, // number, default is 0.005
})
```

6. Make transactions and excute swap

With the instructions and signers from last step, transactions can now be signed and sent.

### Code in action

1. [React Hook](https://github.com/1sol-io/1sol-interface/blob/396b07b696046bea4574373f0f569edf513181b5/src/context/onesolprotocol.tsx)
2. [Get Routes](https://github.com/1sol-io/1sol-interface/blob/396b07b696046bea4574373f0f569edf513181b5/src/components/trade/index.tsx#L121-L125)
3. [Compose instructions and signers](https://github.com/1sol-io/1sol-interface/blob/396b07b696046bea4574373f0f569edf513181b5/src/components/trade/index.tsx#L280-L309)
4. [Sign and send transactions](https://github.com/1sol-io/1sol-interface/blob/396b07b696046bea4574373f0f569edf513181b5/src/utils/pools.tsx#L1264-L1364)
