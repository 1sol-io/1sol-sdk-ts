import {
  PublicKey,
} from '@solana/web3.js'

export const CHAIN_ID = 101;
export const ONESOL_PROTOCOL_PROGRAM_ID = new PublicKey('1SoLTvbiicqXZ3MJmnTL2WYXKLYpuxwHpa4yYrVQaMZ');
export const SERUM_PROGRAM_ID = new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');
export const SABER_STABLE_SWAP_PROGRAM_ID = new PublicKey('SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ');
export const ORCA_SWAP_PROGRAM_ID = new PublicKey('9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP');
export const RAYDIUN_V4_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
export const ONE_MOON_SWAP_PROGRAM_ID = new PublicKey('1MooN32fuBBgApc8ujknKJw5sef3BVwPGgz3pto1BAh');
export const TOKEN_SWAP_PROGRAM_ID = new PublicKey('SwaPpA9LAaLfeLi3a68M4DjnLqgtticKg6CnyNwgAC8')

// export const CHAIN_ID = 103;
// export const ONESOL_PROTOCOL_PROGRAM_ID = new PublicKey('9Bj8zgNWT6UaNcXMgzMFrnH5Z13nQ6vFkRNxP743zZyr');
// export const SERUM_PROGRAM_ID = new PublicKey('DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY');
// export const SABER_STABLE_SWAP_PROGRAM_ID = new PublicKey('SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ');
// export const ORCA_SWAP_PROGRAM_ID = new PublicKey('554sF8DLPVoUrLyjKqjKzPEksz7VtzurThPjFuVAoge3');
// export const RAYDIUN_V4_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
// export const ONE_MOON_SWAP_PROGRAM_ID = new PublicKey('1MooN32fuBBgApc8ujknKJw5sef3BVwPGgz3pto1BAh');
// export const TOKEN_SWAP_PROGRAM_ID = new PublicKey('SwaPpA9LAaLfeLi3a68M4DjnLqgtticKg6CnyNwgAC8')

export const WRAPPED_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export const TOKEN_SWAP_NAME = 'Token Swap'
export const SERUM_DEX_MARKET_NAME = 'Serum'
export const ONESOL_NAME = '1Sol'
export const SABER_STABLE_SWAP_NAME = 'Saber'
export const ORCA_SWAP_NAME = 'Orca'
export const RAYDIUM_NAME = 'Raydium'
export const ONEMOON_NAME = '1Moon'

export const EXCHANGER_SPL_TOKEN_SWAP = 'SplTokenSwap'
export const EXCHANGER_SERUM_DEX = 'SerumDex'
export const EXCHANGER_SABER_STABLE_SWAP = 'SaberStableSwap'
export const EXCHANGER_ORCA_SWAP = 'OrcaSwap'
export const EXCHANGER_RAYDIUM = 'Raydium'
export const EXCHANGER_ONEMOON = 'OneMoon'

export const PROVIDER_MAP: { [key: string]: string } = {
  best_route: ONESOL_NAME,
  [EXCHANGER_SPL_TOKEN_SWAP]: TOKEN_SWAP_NAME,
  [EXCHANGER_SERUM_DEX]: SERUM_DEX_MARKET_NAME,
  [EXCHANGER_SABER_STABLE_SWAP]: SABER_STABLE_SWAP_NAME,
  [EXCHANGER_ORCA_SWAP]: ORCA_SWAP_NAME,
  [EXCHANGER_RAYDIUM]: RAYDIUM_NAME,
  [EXCHANGER_ONEMOON]: ONEMOON_NAME,
}
