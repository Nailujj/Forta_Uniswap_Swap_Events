import { Finding, HandleTransaction, TransactionEvent, getEthersProvider, ethers } from "forta-agent";
import { UNISWAP_FACTORY, SWAP_EVENT, UNISWAP_POOL_ABI, POOL_INIT_CODE_HASH } from "./constants";
import { createFinding as defaultCreateFinding } from "./findings";
import { verifyPoolAddress as defaultVerifyPoolAddress, cache } from "./utils";

const ethersProvider = getEthersProvider();

export function provideHandleTransaction(
  swapEventAbi: string,
  factoryAddress: string,
  initHashCode: string,
  provider: ethers.providers.JsonRpcProvider,
  verifyPoolAddress: typeof defaultVerifyPoolAddress = defaultVerifyPoolAddress,
  createFinding: typeof defaultCreateFinding = defaultCreateFinding
): HandleTransaction {
  return async function handleTransaction(txEvent: TransactionEvent) {
    const findings: Finding[] = [];

    const swaps = txEvent.filterLog(swapEventAbi);

    if (!swaps.length) return findings;

    for (const swap of swaps) {
      let isValid: boolean;

      try {
        isValid = await verifyPoolAddress(
          UNISWAP_POOL_ABI,
          swap.address,
          factoryAddress,
          initHashCode,
          txEvent.block.number,
          provider,
          cache
        );
      } catch (error) {
        console.error(`Error verifying pool address: ${error}`);
        continue;
      }

      if (!isValid) continue;

      findings.push(createFinding(swap.address, swap.args));
    }

    return findings;
  };
}

export default {
  handleTransaction: provideHandleTransaction(
    SWAP_EVENT,
    UNISWAP_FACTORY,
    POOL_INIT_CODE_HASH,
    ethersProvider
  ),
};
