# UniswapV3 Swap Detector

## Description

This bot detects UniswapV3 Swap events across multiple EVM-compatible blockchains. It monitors transactions in real-time to identify swaps occurring within Uniswap V3 liquidity pools. When a swap event is detected, the bot verifies the pool's legitimacy and generates an alert with detailed information about the swap.

## Supported Chains

- Ethereum
- All other EVM chains

## Alerts

The UniswapV3 Swap Detector generates alerts when a swap event is detected. Each alert includes the following information:

- **Name**: "UniswapV3 Swap Detector"
- **Description**: "New swap detected"
- **Alert ID**: "UniswapV3-Swap"
- **Protocol**: "UniswapV3"
- **Severity**: Information level (currently set to `Info`)
- **Type**: Informational alert (currently set to `Info`)
- **Metadata**: Detailed information about the swap, including:
  - `poolAddress`: The address of the liquidity pool where the swap occurred.
  - `sender`: The address of the sender initiating the swap.
  - `recipient`: The address of the recipient receiving the swapped tokens.
  - `amount0`: The amount of token0 swapped.
  - `amount1`: The amount of token1 swapped.
  - `liquidity`: The liquidity involved in the swap.

## Test Data

- [0xc1d9d14dfc866ec0c8d40cb8249b0886bdf3ccec57c500d2b67b839f974884a8](https://etherscan.io/tx/0xc1d9d14dfc866ec0c8d40cb8249b0886bdf3ccec57c500d2b67b839f974884a8) (Ethereum)