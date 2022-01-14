import {
  Connection,
  Keypair,
  PublicKey, Signer, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction
} from '@solana/web3.js';
import * as BufferLayout from '@solana/buffer-layout';

import {
  u64,
} from './index';
import {
  WRAPPED_SOL_MINT,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '../const';
import * as Layout from '../layout';

export const TokenAccountLayout = BufferLayout.struct([
  Layout.publicKey('mint'),
  Layout.publicKey('owner'),
  Layout.u64('amount'),
  BufferLayout.u32('delegateOption'),
  Layout.publicKey('delegate'),
  BufferLayout.u8('state'),
  BufferLayout.u32('isNativeOption'),
  Layout.u64('isNative'),
  Layout.u64('delegatedAmount'),
  BufferLayout.u32('closeAuthorityOption'),
  Layout.publicKey('closeAuthority'),
]);

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
  if (!PublicKey.isOnCurve(owner.toBuffer())) {
    throw new Error(`Owner cannot sign: ${owner.toString()}`);
  }
  return (
    await PublicKey.findProgramAddress(
      [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )
  )[0];
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
  instructions.push(createAssociatedTokenAccountInstruction(
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
  const balanceNeeded = await connection.getMinimumBalanceForRentExemption(
    TokenAccountLayout.span,
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
    createInitAccountInstruction(
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
  const dataLayout = BufferLayout.struct([BufferLayout.u8('instruction')]);
  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: 9, // CloseAccount instruction
    },
    data,
  );

  let keys = [
    { pubkey: account, isSigner: false, isWritable: true },
    { pubkey: wallet, isSigner: false, isWritable: true },
    { pubkey: wallet, isSigner: true, isWritable: false }
  ];

  instructions.push(new TransactionInstruction({
    keys,
    programId: TOKEN_PROGRAM_ID,
    data,
  }));
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

export function createAssociatedTokenAccountInstruction(
  mint: PublicKey,
  associatedAccount: PublicKey,
  owner: PublicKey,
  payer: PublicKey,
): TransactionInstruction {
  const data = Buffer.alloc(0);

  let keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: associatedAccount, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data,
  });
}

export function createInitAccountInstruction(
  mint: PublicKey,
  account: PublicKey,
  owner: PublicKey,
): TransactionInstruction {
  const keys = [
    { pubkey: account, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];
  const dataLayout = BufferLayout.struct([BufferLayout.u8('instruction')]);
  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: 1, // InitializeAccount instruction
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId: TOKEN_PROGRAM_ID,
    data,
  });
}
