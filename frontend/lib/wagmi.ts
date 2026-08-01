import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "viem/chains";

export const hookFlowChain = sepolia;
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim();

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(sepoliaRpcUrl || undefined)
  },
  ssr: true
});
