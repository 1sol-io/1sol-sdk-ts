import { Connection, clusterApiUrl, Signer, TransactionInstruction, PublicKey, Keypair } from '@solana/web3.js'
import { OnesolProtocol } from "@onesol/onesol-sdk"
import { composeInstructions, sendSwapTransactions } from './utils/swap';
import tokenAccountCache from './tokenAccountCache.json'
import privatekey from './privatekey.json'

const connection = new Connection(
    "https://solana-api.projectserum.com",
    'confirmed',
);

const onesol = new OnesolProtocol(connection);
const secretKey = Uint8Array.from(privatekey);
const wallet = Keypair.fromSecretKey(secretKey);

const arbitrage = async () => {
    await onesol.getTokenList()

    /// USDC
    const token = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const tokenAccount = tokenAccountCache[token];

    const amountIn = 100_000000;
    const minDeltaAmount = 1_00000;
    const maxDeltaAmount = amountIn * 0.6;
    const slippage = 0.002;

    while (true) {
        const distributions = await onesol.getRoutes({
            amount: amountIn,
            sourceMintAddress: token,
            destinationMintAddress: token,
            signal: undefined
        });
        const [bestDistribution, ...others] = distributions;
        if (bestDistribution) {
            console.log(`${bestDistribution.amount_in} => ${bestDistribution.amount_out}`, bestDistribution);
            /// keep amount_out - amount_in in [minDeltaAmount, maxDeltaAmount]
            if (
                bestDistribution.amount_out > bestDistribution.amount_in &&
                bestDistribution.amount_out - bestDistribution.amount_in <= maxDeltaAmount &&
                bestDistribution.amount_out - bestDistribution.amount_in >= minDeltaAmount
            ) {
                /// keep mid token mint in white list.
                const midTokenMint = bestDistribution.routes[0][0].destination_token_mint.pubkey;

                const midTokenAccount = tokenAccountCache[midTokenMint];

                console.log('✅ Find arbitrage', `${bestDistribution.amount_in} USDC => ${bestDistribution.amount_out} USDC`);

                const setupInstructions: TransactionInstruction[] = [];
                const setupSigners: Signer[] = [];
                const swapInstructions: TransactionInstruction[] = [];
                const swapSigners: Signer[] = [];
                const cleanupInstructions: TransactionInstruction[] = [];
                const cleanupSigners: Signer[] = [];

                await composeInstructions({
                    onesol,
                    connection,
                    route: bestDistribution,
                    walletAddress: wallet.publicKey,
                    fromTokenAccount: {
                        pubkey: new PublicKey(tokenAccount),
                        mint: new PublicKey(bestDistribution.source_token_mint.pubkey),
                        owner: undefined,
                        programId: undefined,
                        amount: undefined,
                    },
                    midTokenAccount: midTokenAccount ? {
                        pubkey: new PublicKey(midTokenAccount),
                        mint: new PublicKey(midTokenMint),
                        owner: undefined,
                        programId: undefined,
                        amount: undefined,
                    } : undefined,
                    toTokenAccount: {
                        pubkey: new PublicKey(tokenAccount),
                        mint: new PublicKey(bestDistribution.destination_token_mint.pubkey),
                        owner: undefined,
                        programId: undefined,
                        amount: undefined,
                    },
                    setupInstructions,
                    setupSigners,
                    swapInstructions,
                    swapSigners,
                    cleanupInstructions,
                    cleanupSigners,
                    slippage
                })

                console.log(setupInstructions, swapInstructions, cleanupInstructions);

                await sendSwapTransactions({
                    connection,
                    wallet,
                    setupInstructions,
                    swapInstructions,
                    cleanupInstructions,
                    setupSigners,
                    swapSigners,
                    cleanupSigners,
                })
            }
        } else {
            console.log('Unable to find best distribution');
        }


        console.log('Waiting for next epoch after 20s.');
        await (new Promise((resolve) => setTimeout(resolve, 20 * 1000)));
    }
}

arbitrage();