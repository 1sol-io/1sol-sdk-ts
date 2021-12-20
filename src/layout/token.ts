import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout as TokenAccountLayout,
  Token,
  TOKEN_PROGRAM_ID,
  u64,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey, Signer, SystemProgram, TransactionInstruction
} from '@solana/web3.js';
import {
  WRAPPED_SOL_MINT,
} from '../const'


export type TokenMintInfo = {
  mintAuthority: null | PublicKey;
  supply: u64;
  decimals: number;
  isInitialized: boolean;
  freezeAuthority: null | PublicKey;
}

export type TokenAccountInfo = {
  pubkey: PublicKey | null,
  mint: PublicKey,
  programId: PublicKey,
  owner: PublicKey;
  amount: u64;
  delegate: null | PublicKey;
  delegatedAmount: u64;
  isInitialized: boolean;
  isFrozen: boolean;
  isNative: boolean;
}

export async function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
  return await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    owner,
  )
}

export async function createAssociateTokenAccount({
  mint, owner, payer, instructions,
}: {
  mint: PublicKey,
  owner: PublicKey,
  payer: PublicKey,
  instructions: TransactionInstruction[],
}) {
  const tokenAddress = await getAssociatedTokenAddress(mint, owner);
  instructions.push(Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    tokenAddress,
    owner,
    payer
  ));
}

export async function createWrappedNativeAccount({
  connection, owner, payer, amount, instructions, singers
}: {
  connection: Connection,
  owner: PublicKey,
  payer: PublicKey,
  amount: number,
  instructions: TransactionInstruction[],
  singers: Signer[],
}) {
  const balanceNeeded = await Token.getMinBalanceRentForExemptAccount(
    connection,
  );
  const newAccount = Keypair.generate();
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: newAccount.publicKey,
      lamports: balanceNeeded,
      space: TokenAccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );
  singers.push(newAccount);
  instructions.push(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: newAccount.publicKey,
      lamports: amount,
    }),
  );
  instructions.push(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      newAccount.publicKey,
      owner,
    ),
  );
}
