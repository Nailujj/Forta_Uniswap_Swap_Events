import { Finding, FindingSeverity, FindingType } from "forta-agent";
import { TestTransactionEvent } from "forta-agent-tools/lib/test";
import { createAddress, createTransactionHash } from "forta-agent-tools/lib/utils";
import { ethers } from "ethers";
import { provideHandleTransaction } from "./agent";
import { UNISWAP_FACTORY, SWAP_EVENT, POOL_INIT_CODE_HASH } from "./constants";
import { cache } from "./utils";

const mockProvider = new ethers.providers.JsonRpcProvider();

const poolAddress = createAddress("0x1");
const invalidPoolAddress = createAddress("0x2");
const cachedPoolAddress = createAddress("0x3");
const senderAddress = createAddress("0x4");
const recipientAddress = createAddress("0x5");
const anotherValidPoolAddress = createAddress("0x6");

describe("Uniswap V3 Swap Detector Agent", () => {
  let handleTransaction: ReturnType<typeof provideHandleTransaction>;

  beforeAll(() => {
    handleTransaction = provideHandleTransaction(
      SWAP_EVENT,
      UNISWAP_FACTORY,
      POOL_INIT_CODE_HASH,
      mockProvider,
      async (abi, address, factory, hash, block, provider, cache) => {
        const isValid = address === poolAddress || address === anotherValidPoolAddress;
        cache.set(address, isValid);
        return isValid;
      }, // Mock verifyPoolAddress
      () =>
        Finding.fromObject({
          name: "Mock Finding",
          description: "Mock finding for testing",
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
        })
    );
  });

  beforeEach(() => {
    cache.clear();
  });

  it("returns empty findings if no swap events", async () => {
    const txEvent = new TestTransactionEvent();

    const findings = await handleTransaction(txEvent);

    expect(findings).toEqual([]);
  });

  it("returns findings if valid swap events", async () => {
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

    console.log("Findings for valid swap event:", findings);

    expect(findings).toEqual([
      Finding.fromObject({
        name: "Mock Finding",
        description: "Mock finding for testing",
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

  it("skips invalid pool addresses", async () => {
    handleTransaction = provideHandleTransaction(
      SWAP_EVENT,
      UNISWAP_FACTORY,
      POOL_INIT_CODE_HASH,
      mockProvider,
      async () => false, // Mock verifyPoolAddress to return false
      () =>
        Finding.fromObject({
          name: "Mock Finding",
          description: "Mock finding for testing",
          alertId: "NETHERMIND-1",
          protocol: "UniswapV3",
          severity: FindingSeverity.Info,
          type: FindingType.Info,
          metadata: {
            poolAddress: invalidPoolAddress,
            amount0: "1000",
            amount1: "2000",
            sender: senderAddress,
            recipient: recipientAddress,
            liquidity: "500",
          },
        })
    );

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

    console.log("Findings for invalid pool address:", findings);

    expect(findings).toEqual([]);
  });

  it("caches verified pool addresses", async () => {
    handleTransaction = provideHandleTransaction(
      SWAP_EVENT,
      UNISWAP_FACTORY,
      POOL_INIT_CODE_HASH,
      mockProvider,
      async (abi, address, factory, hash, block, provider, cache) => {
        const isValid = address === cachedPoolAddress;
        cache.set(address, isValid);
        return isValid;
      }, // Mock verifyPoolAddress
      () =>
        Finding.fromObject({
          name: "Mock Finding",
          description: "Mock finding for testing",
          alertId: "NETHERMIND-1",
          protocol: "UniswapV3",
          severity: FindingSeverity.Info,
          type: FindingType.Info,
          metadata: {
            poolAddress: cachedPoolAddress,
            amount0: "1000",
            amount1: "2000",
            sender: senderAddress,
            recipient: recipientAddress,
            liquidity: "500",
          },
        })
    );

    const txEvent = new TestTransactionEvent()
      .setFrom(senderAddress)
      .setTo(cachedPoolAddress)
      .addEventLog(SWAP_EVENT, cachedPoolAddress, [
        senderAddress,
        recipientAddress,
        ethers.BigNumber.from(1000),
        ethers.BigNumber.from(2000),
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(500),
        1,
      ])
      .setHash(createTransactionHash({ to: cachedPoolAddress }));

    const findings = await handleTransaction(txEvent);

    console.log("Findings for cached pool address:", findings);

    expect(cache.has(cachedPoolAddress)).toBeTruthy();
  });

  it("caches multiple verified pool addresses", async () => {
    handleTransaction = provideHandleTransaction(
      SWAP_EVENT,
      UNISWAP_FACTORY,
      POOL_INIT_CODE_HASH,
      mockProvider,
      async (abi, address, factory, hash, block, provider, cache) => {
        const isValid = address === cachedPoolAddress || address === anotherValidPoolAddress;
        cache.set(address, isValid);
        return isValid;
      }, // Mock verifyPoolAddress
      () =>
        Finding.fromObject({
          name: "Mock Finding",
          description: "Mock finding for testing",
          alertId: "NETHERMIND-1",
          protocol: "UniswapV3",
          severity: FindingSeverity.Info,
          type: FindingType.Info,
          metadata: {
            poolAddress: cachedPoolAddress,
            amount0: "1000",
            amount1: "2000",
            sender: senderAddress,
            recipient: recipientAddress,
            liquidity: "500",
          },
        })
    );

    const txEvent1 = new TestTransactionEvent()
      .setFrom(senderAddress)
      .setTo(cachedPoolAddress)
      .addEventLog(SWAP_EVENT, cachedPoolAddress, [
        senderAddress,
        recipientAddress,
        ethers.BigNumber.from(1000),
        ethers.BigNumber.from(2000),
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(500),
        1,
      ])
      .setHash(createTransactionHash({ to: cachedPoolAddress }));

    const txEvent2 = new TestTransactionEvent()
      .setFrom(senderAddress)
      .setTo(anotherValidPoolAddress)
      .addEventLog(SWAP_EVENT, anotherValidPoolAddress, [
        senderAddress,
        recipientAddress,
        ethers.BigNumber.from(1000),
        ethers.BigNumber.from(2000),
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(500),
        1,
      ])
      .setHash(createTransactionHash({ to: anotherValidPoolAddress }));

    await handleTransaction(txEvent1);
    await handleTransaction(txEvent2);

    console.log("Cache after multiple valid pool addresses:", cache.dump());

    expect(cache.has(cachedPoolAddress)).toBeTruthy();
    expect(cache.has(anotherValidPoolAddress)).toBeTruthy();
  });

  it("handles exception during pool address verification", async () => {
    handleTransaction = provideHandleTransaction(
      SWAP_EVENT,
      UNISWAP_FACTORY,
      POOL_INIT_CODE_HASH,
      mockProvider,
      async () => {
        throw new Error("Mock error during pool address verification");
      }, // Mock verifyPoolAddress to throw error
      () =>
        Finding.fromObject({
          name: "Mock Finding",
          description: "Mock finding for testing",
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
        })
    );

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

    console.log("Findings when exception occurs during pool address verification:", findings);

    expect(findings).toEqual([]);
  });
});
