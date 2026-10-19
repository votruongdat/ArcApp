# Predict — USDC Prediction Market

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** — what Arc Studio remembers about building this app.

---

## What This App Does

A USDC prediction market DeFi app on Arc Testnet. Users create YES/NO markets with deadlines, bet USDC, and winners claim proportional payouts. Unresolved markets allow full refunds. 2% protocol fee.

## Deployed Contracts

| Contract | Network | Address |
|---|---|---|
| PredictionMarket | Arc Testnet | `0xae0c5d186521bc6669d92eb2ab1b20f68523c04c` |

Explorer: https://explorer.testnet.arc.io/address/0xae0c5d186521bc6669d92eb2ab1b20f68523c04c

Constructor args:
- `usdc`: `0x3600000000000000000000000000000000000000`
- `treasury`: `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`
- `minBet`: `1000000` (1 USDC)

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
