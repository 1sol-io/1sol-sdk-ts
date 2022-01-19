import { Connection, clusterApiUrl, Signer, TransactionInstruction, PublicKey, Keypair } from '@solana/web3.js'
import { OnesolProtocol } from "@onesol/onesol-sdk"
import { composeInstructions, sendSwapTransactions } from './utils/swap';
import { findOrCreateTokenAccount } from '@onesol/onesol-sdk/lib/onesolprotocol';

const connection = new Connection(
    "https://solana-api.projectserum.com",
    'confirmed',
);

const onesol = new OnesolProtocol(connection);
const secretKey = Uint8Array.from([]);
const wallet = Keypair.fromSecretKey(secretKey);

const arbitrage = async () => {
    await onesol.getTokenList()

    /// USDC
    const token = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    /// USDC TokenAccount
    const tokenAccount = "";
    const minDeltaAmount = 100000;
    const maxDeltaAmount = 10_000000;

    while (true) {
        console.log('Begin search arbitrage with USDC => X => USDC.')
        const distributions = await onesol.getRoutes({
            amount: 100_000000,
            sourceMintAddress: token,
            destinationMintAddress: token,
            signal: undefined
        });
        const [bestDistribution, ...others] = distributions;
        if (bestDistribution) {
            if (
                bestDistribution.amount_out > bestDistribution.amount_in &&
                bestDistribution.amount_out - bestDistribution.amount_in <= maxDeltaAmount
            ) {
                console.log('Find arbitrage', bestDistribution, `${bestDistribution.amount_in} => ${bestDistribution.amount_out}`);

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
                })

                try {
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
                } catch (error) {
                    console.log(error);
                }
            } else {
                console.log(`Unable to find arbitrage ${bestDistribution.amount_in} => ${bestDistribution.amount_out}`);
            }
        } else {
            console.log('Unable to find best distribution');
        }

        console.log('Waiting for next epoch after 20s.');
        await (new Promise((resolve) => setTimeout(resolve, 20 * 1000)));
    }
}

arbitrage();