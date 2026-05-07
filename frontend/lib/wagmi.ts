import {createConfig, http, injected} from 'wagmi';
import {coinbaseWallet, metaMask, safe, walletConnect} from 'wagmi/connectors';
import {base, baseSepolia, mainnet, sepolia} from 'wagmi/chains';
import {localAnvilBase, localAnvilEth} from './chains';

const sepoliaRpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? 'https://rpc.sepolia.org';
const baseSepoliaRpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';
const mainnetRpc = process.env.NEXT_PUBLIC_MAINNET_RPC_URL ?? 'https://eth.llamarpc.com';
const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? 'https://mainnet.base.org';
// Local Anvil pair — defaults match the Stage 4 E2E ports (38545 / 38546).
// Override via NEXT_PUBLIC_LOCAL_*_RPC_URL when running standalone Anvils.
const localEthRpc = process.env.NEXT_PUBLIC_LOCAL_ETH_RPC_URL ?? 'http://127.0.0.1:38545';
const localBaseRpc = process.env.NEXT_PUBLIC_LOCAL_BASE_RPC_URL ?? 'http://127.0.0.1:38546';

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

/** Display metadata embedded in wallet confirmation screens. Replace with
 *  the branding spec when it lands; today this is the wireframe placeholder. */
const APP_NAME = 'Intent Layer Protocol';
const APP_URL =
  typeof window !== 'undefined' ? window.location.origin : 'https://intent-layer-protocol.local';

/** Connector list. Order matters — the wallet-picker dialog renders in
 *  this order. WalletConnect is conditional: omitted when the project ID
 *  env is unset so the connector list never contains a broken entry.
 *  Generic injected goes last so named connectors win when the same
 *  provider also exposes EIP-1193 (e.g. MetaMask SDK + window.ethereum). */
const connectors = [
  metaMask({dappMetadata: {name: APP_NAME, url: APP_URL}}),
  coinbaseWallet({appName: APP_NAME}),
  ...(wcProjectId
    ? [
        walletConnect({
          projectId: wcProjectId,
          metadata: {
            name: APP_NAME,
            description: 'Cross-chain intent matching — Ethereum ↔ Base.',
            url: APP_URL,
            icons: [],
          },
          showQrModal: true,
        }),
      ]
    : []),
  safe(),
  injected({shimDisconnect: true}),
];

export const wagmiConfig = createConfig({
  chains: [sepolia, baseSepolia, mainnet, base, localAnvilEth, localAnvilBase],
  connectors,
  transports: {
    [sepolia.id]: http(sepoliaRpc),
    [baseSepolia.id]: http(baseSepoliaRpc),
    [mainnet.id]: http(mainnetRpc),
    [base.id]: http(baseRpc),
    [localAnvilEth.id]: http(localEthRpc),
    [localAnvilBase.id]: http(localBaseRpc),
  },
});
