export interface MarketData {
  id: number
  creator: string
  deadline: bigint
  resolutionDeadline: bigint
  outcome: bigint     // 0=Unresolved, 1=Yes, 2=No
  resolved: boolean
  yesTotal: bigint
  noTotal: bigint
  feeAmount: bigint
  distributablePot: bigint
  question: string
}
