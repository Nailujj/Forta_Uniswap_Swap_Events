import { Finding, FindingSeverity, FindingType, HandleTransaction } from "forta-agent";
import { POOL_INIT_CODE_HASH, UNISWAP_POOL_FUNCTION_SIGNATURE, SWAP_EVENT_ABI } from "./constants";
import { TestTransactionEvent, MockEthersProvider } from "forta-agent-tools/lib/test";
import { createAddress } from "forta-agent-tools";
import { ethers } from "ethers";
import { provideHandleTransaction } from "./agent";
import { Provider } from "@ethersproject/abstract-provider";
import { computeAddress, cache } from "./utils";

describe("Uniswap V3 Swap Event bot", () => {
  let handleTransaction: HandleTransaction;
  let ProxyInterface: ethers.utils.Interface;
  const mockToken0 = createAddress("0xab");
  const mockToken1 = createAddress("0xbab");
  const mockFee = ethers.BigNumber.from("1089");
  const mockPoolValues = [mockToken0, mockToken1, mockFee];
  const mockFactoryAddress = createAddress("0xabc");
  let mockProvider = new MockEthersProvider();
  const mockRandAddress = createAddress("0xadc");
  const mockPoolAddress = computeAddress(mockFactoryAddress, mockPoolValues, POOL_INIT_CODE_HASH);

  const mockEvent = [
    createAddress("0x123"),
    createAddress("0x456"),
    ethers.BigNumber.from("456789"),
    ethers.BigNumber.from("123784"),
    ethers.BigNumber.from("901481"),
    ethers.BigNumber.from("820183"),
    ethers.BigNumber.from("987567"),
  ];

  beforeAll(() => {
    const provider = mockProvider as unknown as Provider;
    handleTransaction = provideHandleTransaction(provider, UNISWAP_POOL_FUNCTION_SIGNATURE, mockFactoryAddress);
    ProxyInterface = new ethers.utils.Interface(UNISWAP_POOL_FUNCTION_SIGNATURE);
  });

  describe("returns empty findings if there are no swap events", () => {
    let mockTxEvent = new TestTransactionEvent();

    it("returns empty findings the transaction is not a swap", async () => {
      mockTxEvent = new TestTransactionEvent();
      mockTxEvent.setBlock(0);
      mockTxEvent.setFrom(mockRandAddress).setTo(mockPoolAddress).setValue("123456789");
  
      // Add a random non-swap event
      const RANDOM_EVENT_SIGNATURE = "event RandomEvent(address indexed sender, uint256 value)";
      const randomEvent = [createAddress("0x789"), ethers.BigNumber.from("987654")];
      mockTxEvent.addEventLog(RANDOM_EVENT_SIGNATURE, mockRandAddress, randomEvent);
  
      const findings = await handleTransaction(mockTxEvent);
  
      expect(findings).toStrictEqual([]);
    });

    it("returns empty findings if the swap doesn't occur on Uniswap V3", async () => {
      mockTxEvent = new TestTransactionEvent();
      mockTxEvent.setBlock(0);
      mockTxEvent.addEventLog(SWAP_EVENT_ABI, mockRandAddress, mockEvent);

      mockProvider.addCallTo(mockRandAddress, 0, ProxyInterface, "token0", {
        inputs: [],
        outputs: [mockToken0],
      });
      mockProvider.addCallTo(mockRandAddress, 0, ProxyInterface, "token1", {
        inputs: [],
        outputs: [mockToken1],
      });
      mockProvider.addCallTo(mockRandAddress, 0, ProxyInterface, "fee", {
        inputs: [],
        outputs: [mockFee],
      });

      mockProvider.setLatestBlock(0);

      const findings = await handleTransaction(mockTxEvent);
      expect(findings).toStrictEqual([]);
    });

    it("returns findings if valid swap event", async () => {
      mockTxEvent = new TestTransactionEvent();
      mockTxEvent.setBlock(0);
      mockTxEvent.addEventLog(SWAP_EVENT_ABI, mockPoolAddress, mockEvent);

      mockProvider.addCallTo(mockPoolAddress, 0, ProxyInterface, "token0", {
        inputs: [],
        outputs: [mockToken0],
      });
      mockProvider.addCallTo(mockPoolAddress, 0, ProxyInterface, "token1", {
        inputs: [],
        outputs: [mockToken1],
      });
      mockProvider.addCallTo(mockPoolAddress, 0, ProxyInterface, "fee", {
        inputs: [],
        outputs: [mockFee],
      });

      mockProvider.setLatestBlock(0);

      const findings = await handleTransaction(mockTxEvent);

      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: "Uniswap V3 Swap Event Detector",
          description: "Detects new Swap events from Uniswap V3 pool",
          alertId: "NETHERMIND-1",
          severity: FindingSeverity.Info,
          type: FindingType.Info,
          protocol: "UniswapV3",
          metadata: {
            poolAddress: mockPoolAddress.toLowerCase(),
            sender: mockEvent[0].toString(),
            recipient: mockEvent[1].toString(),
            amount0: mockEvent[2].toString(),
            amount1: mockEvent[3].toString(),
            liquidity: mockEvent[4].toString(),
          },
        }),
      ]);
    });

    it("Caches verified pool addresses", async () => {
      mockTxEvent = new TestTransactionEvent();
      mockTxEvent.setBlock(0);
      mockTxEvent.addEventLog(SWAP_EVENT_ABI, mockPoolAddress, mockEvent);

      mockProvider.addCallTo(mockPoolAddress, 0, ProxyInterface, "token0", {
        inputs: [],
        outputs: [mockToken0],
      });
      mockProvider.addCallTo(mockPoolAddress, 0, ProxyInterface, "token1", {
        inputs: [],
        outputs: [mockToken1],
      });
      mockProvider.addCallTo(mockPoolAddress, 0, ProxyInterface, "fee", {
        inputs: [],
        outputs: [mockFee],
      });

      mockProvider.setLatestBlock(0);

      expect(cache.has(mockPoolAddress.toLowerCase())).toBe(true);
    });

    it("creates findings for two swaps on a valid pool and one on a non-valid pool", async () => {
      mockTxEvent = new TestTransactionEvent();
      mockTxEvent.setBlock(0);

      // Add two swap events for a valid pool
      mockTxEvent.addEventLog(SWAP_EVENT_ABI, mockPoolAddress, mockEvent);
      mockTxEvent.addEventLog(SWAP_EVENT_ABI, mockPoolAddress, mockEvent);

      // Add one swap event for a non-valid pool
      const nonValidPoolAddress = createAddress("0xdefabc"); // Using a valid hex string
      mockTxEvent.addEventLog(SWAP_EVENT_ABI, nonValidPoolAddress, mockEvent);

      // Mock the provider responses for valid pool
      mockProvider.addCallTo(mockPoolAddress, 0, ProxyInterface, "token0", {
        inputs: [],
        outputs: [mockToken0],
      });
      mockProvider.addCallTo(mockPoolAddress, 0, ProxyInterface, "token1", {
        inputs: [],
        outputs: [mockToken1],
      });
      mockProvider.addCallTo(mockPoolAddress, 0, ProxyInterface, "fee", {
        inputs: [],
        outputs: [mockFee],
      });

      // Mock the provider responses for non-valid pool with valid hex strings
      mockProvider.addCallTo(nonValidPoolAddress, 0, ProxyInterface, "token0", {
        inputs: [],
        outputs: [createAddress("0xdef0a0")],
      });
      mockProvider.addCallTo(nonValidPoolAddress, 0, ProxyInterface, "token1", {
        inputs: [],
        outputs: [createAddress("0xdef0b0")],
      });
      mockProvider.addCallTo(nonValidPoolAddress, 0, ProxyInterface, "fee", {
        inputs: [],
        outputs: [ethers.BigNumber.from("9999")],
      });

      mockProvider.setLatestBlock(0);

      const findings = await handleTransaction(mockTxEvent);

      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: "Uniswap V3 Swap Event Detector",
          description: "Detects new Swap events from Uniswap V3 pool",
          alertId: "NETHERMIND-1",
          severity: FindingSeverity.Info,
          type: FindingType.Info,
          protocol: "UniswapV3",
          metadata: {
            poolAddress: mockPoolAddress.toLowerCase(),
            sender: mockEvent[0].toString(),
            recipient: mockEvent[1].toString(),
            amount0: mockEvent[2].toString(),
            amount1: mockEvent[3].toString(),
            liquidity: mockEvent[4].toString(),
          },
        }),
        Finding.fromObject({
          name: "Uniswap V3 Swap Event Detector",
          description: "Detects new Swap events from Uniswap V3 pool",
          alertId: "NETHERMIND-1",
          severity: FindingSeverity.Info,
          type: FindingType.Info,
          protocol: "UniswapV3",
          metadata: {
            poolAddress: mockPoolAddress.toLowerCase(),
            sender: mockEvent[0].toString(),
            recipient: mockEvent[1].toString(),
            amount0: mockEvent[2].toString(),
            amount1: mockEvent[3].toString(),
            liquidity: mockEvent[4].toString(),
          },
        }),
      ]);
    });
  });
});
