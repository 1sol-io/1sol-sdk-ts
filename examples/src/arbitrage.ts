import { Connection, clusterApiUrl, Signer, TransactionInstruction, PublicKey, Keypair } from '@solana/web3.js'
import { OnesolProtocol } from "@onesol/onesol-sdk"
import { composeInstructions, sendSwapTransactions } from './utils/swap';

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
    const tokenAccount = undefined;

    const whiteTokenMap = {
        /// WSOL
        "So11111111111111111111111111111111111111112": undefined,
        /// ETH
        "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": undefined,
        /// WBTC
        "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E": undefined,
        /// BASIS
        "Basis9oJw9j8cw53oMV7iqsgo6ihi9ALw4QR31rcjUJa": undefined,
        /// RAY
        "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": undefined,
        /// ORCA
        "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": undefined,
        /// mSOL
        "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": undefined,
        /// SRM
        "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt": undefined,
        /// BNB
        "9gP2kCy3wA1ctvYWQk75guqXuHfrEomqydHLtcTCqiLa": undefined,
        /// LINK
        "2wpTofQ8SkACrkZWrZDjXPitYa8AwWgX8AfxdeBRRVLX": undefined,
        /// SLND
        "SLNDpmoWTVADgEdndyvWzroNL7zSi1dF9PC3xHGtPwp": undefined,
    }
    const whiteList = Object.keys(whiteTokenMap);

    const minDeltaAmount = 1_00000;
    const maxDeltaAmount = 10_000000;
    const slippage = 0.001;

    while (true) {
        const distributions = await onesol.getRoutes({
            amount: 100_000000,
            sourceMintAddress: token,
            destinationMintAddress: token,
            signal: undefined
        });
        const [bestDistribution, ...others] = distributions;
        if (bestDistribution) {
            /// keep mid token mint in white list.
            const midTokenMint = bestDistribution.routes[0][0].destination_token_mint.pubkey;
            if (whiteList.includes(midTokenMint)) {
                /// keep amount_out - amount_in in [minDeltaAmount, maxDeltaAmount]
                if (
                    bestDistribution.amount_out > bestDistribution.amount_in &&
                    bestDistribution.amount_out - bestDistribution.amount_in <= maxDeltaAmount &&
                    bestDistribution.amount_out - bestDistribution.amount_in >= minDeltaAmount
                ) {
                    const midTokenAccount = whiteTokenMap[midTokenMint];

                    console.log('✅ Find arbitrage', `${bestDistribution.amount_in} USDC => ${bestDistribution.amount_out} USDC`, bestDistribution);

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
                } else {
                    console.log(`Unable to find arbitrage ${bestDistribution.amount_in} => ${bestDistribution.amount_out}`);
                }
            } else {
                console.log(midTokenMint, 'not in white list.')
            }
        } else {
            console.log('Unable to find best distribution');
        }


        console.log('Waiting for next epoch after 20s.');
        await (new Promise((resolve) => setTimeout(resolve, 20 * 1000)));
    }
}

arbitrage();