import { Connection, clusterApiUrl, Signer, TransactionInstruction, PublicKey, Keypair } from '@solana/web3.js'
import { OnesolProtocol } from "@onesol/onesol-sdk"
import privatekey from './privatekey.json'
import { sendTx } from './utils/connection';

const connection = new Connection(
    "",
    'confirmed',
);

const onesol = new OnesolProtocol(connection);
const wallet = Keypair.fromSecretKey(
    Uint8Array.from(privatekey)
);

const arbitrage = async () => {

    /// USDC
    const sourceMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const destinationMint = sourceMint;
    const decimals = 1e6;

    const amountIn = 10 * decimals;
    const minDeltaAmount = 0.01 * decimals;
    const maxDeltaAmount = amountIn * 0.6;
    const slippage = 0.002;

    while (true) {
        const distributions = await onesol.getRoutes({
            amount: amountIn,
            sourceMintAddress: sourceMint,
            destinationMintAddress: destinationMint,
            experiment: true,
            size: 1,
        });
        const [bestDistribution, ...others] = distributions;
        if (bestDistribution) {
            console.log(`${bestDistribution.amountIn} => ${bestDistribution.amountOut}`);
            if (
                bestDistribution.amountOut > bestDistribution.amountIn &&
                bestDistribution.amountOut - bestDistribution.amountIn <= maxDeltaAmount &&
                bestDistribution.amountOut - bestDistribution.amountIn >= minDeltaAmount
            ) {
                /// keep mid token mint in white list.
                const midTokenMint = bestDistribution.routes[0][0].destinationTokenMint.address;

                console.log('✅ Find arbitrage', `${bestDistribution.amountIn} USDC => ${bestDistribution.amountOut} USDC`);

                const transactions = await onesol.getTransactions({
                    wallet: wallet.publicKey,
                    distribution: bestDistribution,
                    slippage,
                })

                try {
                    if (transactions.length == 1) {
                        const { signature, error } = await sendTx(connection, wallet, transactions[0], sourceMint, destinationMint);
                    } else if (transactions.length == 3) {
                        for (let index = 0; index < transactions.length; index++) {
                            try {
                                const { signature, error } = await sendTx(connection, wallet, transactions[index], sourceMint, destinationMint, { skipPreflight: true }, index == 0 || index == 2);
                            } catch (error) {
                                if (transactions.length == 3 && index == 1) {
                                    const { signature, error } = await sendTx(connection, wallet, transactions[2], sourceMint, destinationMint, { skipPreflight: true }, true)
                                }
                            }
                        }
                    } else {
                        console.log('abort')
                        break;
                    }
                } catch (error) {
                    console.log(error)
                }
            }
        } else {
            console.log('Unable to find best distribution');
        }


        console.log('Waiting for next epoch after 5s.');
        await (new Promise((resolve) => setTimeout(resolve, 5 * 1000)));
    }
}

arbitrage();