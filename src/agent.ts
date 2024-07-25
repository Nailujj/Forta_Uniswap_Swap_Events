import {
  Finding,
  HandleTransaction,
  TransactionEvent,
  FindingSeverity,
  FindingType,
  getEthersProvider,
} from "forta-agent";
import { UNISWAP_FACTORY_ADDRESS, UNISWAP_POOL_FUNCTION_SIGNATURE, SWAP_FUNCTION_SIGNATURE } from "./constants";
import { ethers } from "ethers";
import { getPoolValues, verifyAddress } from "./utils";

export function provideHandleTransaction(
  provider: ethers.providers.Provider,
  uniswapPoolABI: string[],
  factoryAddress: string
): HandleTransaction {
  return async function handleTransaction(txEvent: TransactionEvent) {
    const findings: Finding[] = [];

    const swapTxs = txEvent.filterLog(SWAP_FUNCTION_SIGNATURE);

    for (const tx of swapTxs) {
      try {
        const [sender, recipient, amount0, amount1, liquidity] = tx.args;

        const poolAddress = tx.address;

        const { token0, token1, fee } = await getPoolValues(poolAddress, provider, uniswapPoolABI, txEvent.blockNumber);

        const uniswapAddressBool = await verifyAddress(poolAddress, factoryAddress, token0, token1, fee);

        if (!uniswapAddressBool) {
          continue;
        }

        findings.push(
          Finding.fromObject({
            name: "Uniswap V3 Swap Event Detector",
            description: "Detects new Swap events from Uniswap V3 pool",
            alertId: "NETHERMIND-1",
            severity: FindingSeverity.Info,
            type: FindingType.Info,
            protocol: "UniswapV3",
            metadata: {
              poolAddress: poolAddress.toLowerCase(),
              sender: sender.toString(),
              recipient: recipient.toString(),
              amount0: amount0.toString(),
              amount1: amount1.toString(),
              liquidity: liquidity.toString(),
            },
          })
        );
      } catch (e) {
        return findings;
      }
    }

    return findings;
  };
}

export default {
  handleTransaction: provideHandleTransaction(
    getEthersProvider(),
    UNISWAP_POOL_FUNCTION_SIGNATURE,
    UNISWAP_FACTORY_ADDRESS
  ),
};
