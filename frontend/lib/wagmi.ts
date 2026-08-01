import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "viem/chains";

export const hookFlowChain = sepolia;

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http()
  },
  ssr: true
});
