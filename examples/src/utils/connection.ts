import {
    Connection,
    sendAndConfirmRawTransaction,
    sendAndConfirmTransaction,
    Signer,
    Transaction,
    Keypair,
    SignatureResult,
    SendOptions,
    TransactionInstruction,
} from "@solana/web3.js";

export const sendTx = async (connection: Connection, wallet: Keypair, transaction: Transaction, sourceMint, destinationMint, options?: SendOptions, awaitConfirm = true) => {
    transaction.partialSign(wallet);
    const rawTransaction = transaction.serialize()
    const signature = await connection.sendRawTransaction(rawTransaction, options);
    console.log(`Send Tx ${sourceMint} => ${destinationMint} ${signature} \n`);

    var status: SignatureResult;
    if (awaitConfirm) {
        status = (await connection.confirmTransaction(signature, 'confirmed')).value;
    }

    if (status.err) {
        console.log(status.err)
    }

    return { signature, error: status.err };
}