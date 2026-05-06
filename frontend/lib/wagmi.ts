import {createConfig, http, injected} from 'wagmi';
import {base, baseSepolia, mainnet, sepolia} from 'wagmi/chains';

const sepoliaRpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? 'https://rpc.sepolia.org';
const baseSepoliaRpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
const mainnetRpc = process.env.NEXT_PUBLIC_MAINNET_RPC_URL ?? 'https://eth.llamarpc.com';
const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? 'https://mainnet.base.org';

export const wagmiConfig = createConfig({
  chains: [sepolia, baseSepolia, mainnet, base],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(sepoliaRpc),
    [baseSepolia.id]: http(baseSepoliaRpc),
    [mainnet.id]: http(mainnetRpc),
    [base.id]: http(baseRpc),
  },
});
