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
  amount: u64
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
}): Promise<PublicKey> {
  const tokenAddress = await getAssociatedTokenAddress(mint, owner);
  instructions.push(Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    tokenAddress,
    owner,
    payer
  ));

  return tokenAddress;
}

export async function createWrappedNativeAccount({
  connection, owner, payer, amount, instructions, signers
}: {
  connection: Connection,
  owner: PublicKey,
  payer: PublicKey,
  amount: number,
  instructions: TransactionInstruction[],
  signers: Signer[],
}): Promise<PublicKey> {
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

  signers.push(newAccount);

  if (amount > 0) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: newAccount.publicKey,
        lamports: amount,
      }),
    );
  }

  instructions.push(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      newAccount.publicKey,
      owner,
    ),
  );

  return newAccount.publicKey
}

export async function closeTokenAccount({
  account,
  wallet,
  instructions,
}: {
  account: PublicKey,
  wallet: PublicKey,
  instructions: TransactionInstruction[],
}) {
  instructions.push(Token.createCloseAccountInstruction(
    TOKEN_PROGRAM_ID,
    account,
    wallet,
    wallet,
    [],
  ))
}

export async function createTokenAccount({
  connection,
  owner,
  payer,
  mint,
  amount = 0,
  instructions,
  signers,
  cleanInstructions,
  cleanSigners,
}: {
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  payer: PublicKey,
  amount?: number,
  instructions: TransactionInstruction[],
  signers: Signer[],
  cleanInstructions: TransactionInstruction[],
  cleanSigners: Signer[],
}): Promise<PublicKey> {
  let account

  if (mint.equals(WRAPPED_SOL_MINT)) {
    account = await createWrappedNativeAccount({
      connection,
      owner,
      payer,
      amount,
      instructions,
      signers,
    })

    await closeTokenAccount({
      account,
      wallet: owner,
      instructions: cleanInstructions
    })
  } else {
    account = await createAssociateTokenAccount({
      mint,
      owner,
      payer,
      instructions,
    })
  }

  return account
}

export async function findOrCreateTokenAccount({
  connection,
  owner,
  payer,
  mint,
  amount = 0,
  instructions,
  signers,
  cleanInstructions,
  cleanSigners,
}: {
  connection: Connection,
  owner: PublicKey,
  payer: PublicKey,
  mint: PublicKey,
  amount?: number,
  instructions: TransactionInstruction[],
  signers: Signer[],
  cleanInstructions: TransactionInstruction[],
  cleanSigners: Signer[],
}): Promise<PublicKey> {
  if (mint.equals(WRAPPED_SOL_MINT)) {
    const account = await createWrappedNativeAccount({
      connection,
      owner,
      payer,
      amount,
      instructions,
      signers,
    })

    await closeTokenAccount({
      account,
      wallet: owner,
      instructions: cleanInstructions
    })

    return account
  } else {
    const tokenAddress = await getAssociatedTokenAddress(mint, owner);
    const tokenAccount = await connection.getAccountInfo(tokenAddress);

    if (tokenAccount) {
      return tokenAddress
    }

    const account = await createAssociateTokenAccount({
      mint,
      owner,
      payer,
      instructions,
    })

    return account
  }
}
