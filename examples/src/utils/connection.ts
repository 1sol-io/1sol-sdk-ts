import {
    Connection,
    sendAndConfirmRawTransaction,
    sendAndConfirmTransaction,
    Signer,
    Transaction,
    TransactionInstruction,
} from "@solana/web3.js";

export const sendTransaction = async (connection: Connection, wallet: Signer, instructions: TransactionInstruction[], signers: Signer[]) => {
    try {
        const tx = new Transaction();
        tx.add(...instructions);
        tx.recentBlockhash = (
            await connection.getRecentBlockhash("max")
        ).blockhash;
        tx.feePayer = wallet.publicKey
        if (signers.length)
            tx.partialSign(...signers);
        tx.partialSign(wallet)
        const rawTransaction = tx.serialize();
        await sendAndConfirmRawTransaction(connection, rawTransaction, {
            skipPreflight: true,
            commitment: "confirmed",
        });
    } catch (error) {
        console.log(error);
    }
}