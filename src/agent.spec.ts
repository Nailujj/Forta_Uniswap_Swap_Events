import { Finding, FindingSeverity, FindingType } from "forta-agent";
import { TestTransactionEvent } from "forta-agent-tools/lib/test";
import { createAddress, createTransactionHash } from "forta-agent-tools/lib/utils";
import { ethers } from "ethers";
import { provideHandleTransaction } from "./agent";
import { UNISWAP_FACTORY, SWAP_EVENT, POOL_INIT_CODE_HASH } from "./constants";
import { cache, verifyPoolAddress, computePoolAddress } from "./utils";

const mockProvider = new ethers.providers.JsonRpcProvider();

const token0 = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC
const token1 = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH
const fee = 3000; // 0.3%

const poolAddress = computePoolAddress(UNISWAP_FACTORY, POOL_INIT_CODE_HASH, [token0, token1, fee]);

const invalidPoolAddress = createAddress("0x2");
const cachedPoolAddress = createAddress("0x3");
const senderAddress = createAddress("0x4");
const recipientAddress = createAddress("0x5");
const anotherValidPoolAddress = createAddress("0x6");

jest.mock("./utils", () => ({
  ...jest.requireActual("./utils"),
  verifyPoolAddress: jest.fn(),
}));

describe("Uniswap V3 Swap Detector Agent", () => {
  let handleTransaction: ReturnType<typeof provideHandleTransaction>;

  beforeAll(() => {
    handleTransaction = provideHandleTransaction(
      SWAP_EVENT,
      UNISWAP_FACTORY,
      POOL_INIT_CODE_HASH,
      mockProvider
    );
  });

  beforeEach(() => {
    cache.clear();
    jest.clearAllMocks();
  });

  it("returns empty findings if non-swap events", async () => {
    const txEvent = new TestTransactionEvent();
    const findings = await handleTransaction(txEvent);
    expect(findings).toEqual([]);
  });

  it("skips invalid pool addresses", async () => {
    (verifyPoolAddress as jest.Mock).mockResolvedValue(false);

    const txEvent = new TestTransactionEvent()
      .setFrom(senderAddress)
      .setTo(invalidPoolAddress)
      .addEventLog(SWAP_EVENT, invalidPoolAddress, [
        senderAddress,
        recipientAddress,
        ethers.BigNumber.from(1000),
        ethers.BigNumber.from(2000),
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(500),
        1,
      ])
      .setHash(createTransactionHash({ to: invalidPoolAddress }));

    const findings = await handleTransaction(txEvent);
    expect(findings).toEqual([]);
  });

  it("handles exception during pool address verification", async () => {
    (verifyPoolAddress as jest.Mock).mockImplementation(() => {
      throw new Error("Test error");
    });

    const txEvent = new TestTransactionEvent()
      .setFrom(senderAddress)
      .setTo(poolAddress)
      .addEventLog(SWAP_EVENT, poolAddress, [
        senderAddress,
        recipientAddress,
        ethers.BigNumber.from(1000),
        ethers.BigNumber.from(2000),
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(500),
        1,
      ])
      .setHash(createTransactionHash({ to: poolAddress }));

    const findings = await handleTransaction(txEvent);
    expect(findings).toEqual([]);
  });

  it("caches verified pool addresses", async () => {
    const txEvent = new TestTransactionEvent()
      .setFrom(senderAddress)
      .setTo(poolAddress)
      .addEventLog(SWAP_EVENT, poolAddress, [
        senderAddress,
        recipientAddress,
        ethers.BigNumber.from(1000),
        ethers.BigNumber.from(2000),
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(500),
        1,
      ])
      .setHash(createTransactionHash({ to: poolAddress }));

    // First call to handleTransaction should trigger the verification and cache the result
    await handleTransaction(txEvent);

    expect(cache.get(poolAddress)).toBeTruthy();
 
    // Second call to handleTransaction should use the cached result
    const findings = await handleTransaction(txEvent);

    expect(findings).toEqual([
      Finding.fromObject({
        name: "UniswapV3 Swap Detector",
        description: "New swap detected",
        alertId: "NETHERMIND-1",
        protocol: "UniswapV3",
        severity: FindingSeverity.Info,
        type: FindingType.Info,
        metadata: {
          poolAddress,
          amount0: "1000",
          amount1: "2000",
          sender: senderAddress,
          recipient: recipientAddress,
          liquidity: "500",
        },
      }),
    ]);
    expect(verifyPoolAddress).toHaveBeenCalledTimes(1); // still 1 because the second call used cache
  });
  
  

  it("returns findings if valid swap events", async () => {
    (verifyPoolAddress as jest.Mock).mockResolvedValue(true);

    const txEvent = new TestTransactionEvent()
      .setFrom(senderAddress)
      .setTo(poolAddress)
      .addEventLog(SWAP_EVENT, poolAddress, [
        senderAddress,
        recipientAddress,
        ethers.BigNumber.from(1000),
        ethers.BigNumber.from(2000),
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(500),
        1,
      ])
      .setHash(createTransactionHash({ to: poolAddress }));

    const findings = await handleTransaction(txEvent);

    expect(findings).toEqual([
      Finding.fromObject({
        name: "UniswapV3 Swap Detector",
        description: "New swap detected",
        alertId: "NETHERMIND-1",
        protocol: "UniswapV3",
        severity: FindingSeverity.Info,
        type: FindingType.Info,
        metadata: {
          poolAddress,
          amount0: "1000",
          amount1: "2000",
          sender: senderAddress,
          recipient: recipientAddress,
          liquidity: "500",
        },
      }),
    ]);
  });

  it("creates findings for valid swaps and ignores invalid swaps", async () => {
    (verifyPoolAddress as jest.Mock).mockImplementation((address) => {
      console.log(`Verifying pool address: ${address}`);
      if (address === poolAddress || address === anotherValidPoolAddress) {
        return true;
      }
      return false;
    });
  
    const txEvent = new TestTransactionEvent()
      .setFrom(senderAddress)
      .addEventLog(SWAP_EVENT, poolAddress, [
        senderAddress,
        recipientAddress,
        ethers.BigNumber.from(1000),
        ethers.BigNumber.from(2000),
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(500),
        1,
      ])
      .addEventLog(SWAP_EVENT, invalidPoolAddress, [
        senderAddress,
        recipientAddress,
        ethers.BigNumber.from(3000),
        ethers.BigNumber.from(4000),
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(700),
        1,
      ])
      .addEventLog(SWAP_EVENT, anotherValidPoolAddress, [
        senderAddress,
        recipientAddress,
        ethers.BigNumber.from(5000),
        ethers.BigNumber.from(6000),
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(900),
        1,
      ])
      .setHash(createTransactionHash({ to: poolAddress }));
  
    const findings = await handleTransaction(txEvent);
    console.log("Findings for mixed valid and invalid swap events:", findings);
  
    expect(findings).toEqual([
      Finding.fromObject({
        name: "UniswapV3 Swap Detector",
        description: "New swap detected",
        alertId: "NETHERMIND-1",
        protocol: "UniswapV3",
        severity: FindingSeverity.Info,
        type: FindingType.Info,
        metadata: {
          poolAddress,
          amount0: "1000",
          amount1: "2000",
          sender: senderAddress,
          recipient: recipientAddress,
          liquidity: "500",
        },
      }),
      Finding.fromObject({
        name: "UniswapV3 Swap Detector",
        description: "New swap detected",
        alertId: "NETHERMIND-1",
        protocol: "UniswapV3",
        severity: FindingSeverity.Info,
        type: FindingType.Info,
        metadata: {
          poolAddress: anotherValidPoolAddress,
          amount0: "5000",
          amount1: "6000",
          sender: senderAddress,
          recipient: recipientAddress,
          liquidity: "900",
        },
      }),
    ]);

    
  });
  
  
  
});
