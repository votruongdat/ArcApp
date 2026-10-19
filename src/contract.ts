import artifact from '../contracts/out/PredictionMarket.sol/PredictionMarket.json'
import type { Abi } from 'viem'

export const PREDICTION_MARKET = {
  address: '0xae0c5d186521bc6669d92eb2ab1b20f68523c04c' as const,
  abi: artifact.abi as Abi,
} as const
