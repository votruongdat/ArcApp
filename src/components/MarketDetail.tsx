import { useState } from 'react'
import { CheckCircle, XCircle, RotateCcw, ExternalLink, ChevronRight, Loader2 } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { PREDICTION_MARKET } from '../contract'
import { buildTxExplorerUrl } from '@/onchain-facts'
import type { MarketData } from './types'

const ARC_TESTNET_ID = 5042002
const MODULE_LOAD_SEC = Math.floor(performance.timeOrigin / 1000 + performance.now() / 1000)

const glass = {
  card: {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

function formatUSDC(raw: bigint): string {
  return (Number(raw) / 1_000_000).toFixed(2)
}

function formatDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface MarketDetailProps {
  market: MarketData
  onRefresh: () => void
  onBet: () => void
}

export function MarketDetail({ market, onRefresh, onBet }: MarketDetailProps) {
  const { isConnected, address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [resolveChoice, setResolveChoice] = useState<boolean | null>(null)
  const isWrongChain = isConnected && chainId !== ARC_TESTNET_ID

  const now = MODULE_LOAD_SEC
  const isClosed = now >= Number(market.deadline)
  const isExpired = now > Number(market.resolutionDeadline)
  const isCreator = address?.toLowerCase() === market.creator.toLowerCase()
  const totalPool = market.yesTotal + market.noTotal
  const yesPercent = totalPool > 0n ? Math.round(Number(market.yesTotal * 100n) / Number(totalPool)) : 50

  // User bets
  const { data: userBets } = useReadContract({
    ...PREDICTION_MARKET,
    functionName: 'getUserBets',
    args: address ? [BigInt(market.id), address] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address },
  })
  const userYes: bigint = userBets ? (userBets as [bigint, bigint])[0] : 0n
  const userNo: bigint = userBets ? (userBets as [bigint, bigint])[1] : 0n
  const hasWinningBet = market.resolved
    ? (market.outcome === 1n && userYes > 0n) || (market.outcome === 2n && userNo > 0n)
    : false
  const hasRefundableBet = !market.resolved && isExpired && (userYes > 0n || userNo > 0n)

  // Read claim states
  const { data: hasClaimed } = useReadContract({
    ...PREDICTION_MARKET,
    functionName: 'winningsClaimed',
    args: address ? [BigInt(market.id), address] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && market.resolved },
  })
  const { data: hasRefunded } = useReadContract({
    ...PREDICTION_MARKET,
    functionName: 'refundsClaimed',
    args: address ? [BigInt(market.id), address] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && !market.resolved && isExpired },
  })

  // Resolve
  const { writeContract: resolve, data: resolveHash, isPending: isResolvePending } = useWriteContract()
  const { isLoading: isResolveConfirming, isSuccess: isResolveSuccess } = useWaitForTransactionReceipt({ hash: resolveHash })

  // Claim
  const { writeContract: claim, data: claimHash, isPending: isClaimPending } = useWriteContract()
  const { isLoading: isClaimConfirming, isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({ hash: claimHash })

  if (isResolveSuccess && resolveHash) {
    toast.success('Market resolved!', {
      action: { label: 'View', onClick: () => window.open(buildTxExplorerUrl(ARC_TESTNET_ID, resolveHash), '_blank') },
    })
    onRefresh()
  }

  if (isClaimSuccess && claimHash) {
    toast.success('Claimed successfully!', {
      action: { label: 'View', onClick: () => window.open(buildTxExplorerUrl(ARC_TESTNET_ID, claimHash), '_blank') },
    })
    onRefresh()
  }

  const handleResolve = () => {
    if (resolveChoice === null || !isConnected) return
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    resolve({
      ...PREDICTION_MARKET,
      functionName: 'resolveMarket',
      args: [BigInt(market.id), resolveChoice],
    }, {
      onError: (err) => {
        const msg = err.message?.toLowerCase() || ''
        if (!msg.includes('user rejected')) toast.error('Resolution failed: ' + (msg.includes('winning side has no stake') ? 'winning side has no bets' : 'please try again'))
      },
    })
  }

  const handleClaim = () => {
    if (!isConnected) return
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    claim({
      ...PREDICTION_MARKET,
      functionName: hasRefundableBet ? 'claimRefund' : 'claimWinnings',
      args: [BigInt(market.id)],
    }, {
      onError: (err) => {
        const msg = err.message?.toLowerCase() || ''
        if (!msg.includes('user rejected')) toast.error('Claim failed')
      },
    })
  }

  return (
    <div className="rounded-2xl p-4 space-y-3" style={glass.card}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--muted)', letterSpacing: '0.07em' }}>
            Market #{market.id}
          </p>
          <h3 className="display text-base font-bold leading-snug" style={{ color: 'var(--ink)' }}>
            {market.question}
          </h3>
        </div>
        {market.resolved && (
          <span className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={market.outcome === 1n
              ? { background: 'rgba(26,128,71,0.1)', color: 'var(--success)' }
              : { background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>
            {market.outcome === 1n ? <CheckCircle className="size-3.5" /> : <XCircle className="size-3.5" />}
            {market.outcome === 1n ? 'YES' : 'NO'} won
          </span>
        )}
      </div>

      {/* Pool bar */}
      <div className="rounded-full overflow-hidden h-3" style={{ background: 'rgba(18,45,69,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${yesPercent}%`, background: 'linear-gradient(90deg, var(--success), #3baa6b)' }} />
      </div>
      <div className="flex justify-between text-xs tabular-nums">
        <span className="font-semibold" style={{ color: 'var(--success)' }}>YES {yesPercent}% · {formatUSDC(market.yesTotal)} USDC</span>
        <span className="font-semibold" style={{ color: 'var(--danger)' }}>NO {100 - yesPercent}% · {formatUSDC(market.noTotal)} USDC</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total Pool', value: `$${formatUSDC(totalPool)}` },
          { label: 'Deadline', value: formatDate(market.deadline) },
          { label: 'Fee', value: '2%' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl px-3 py-2.5 text-center" style={glass.inner}>
            <p className="text-xs tabular-nums font-bold" style={{ color: 'var(--ink)' }}>{s.value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* User bets */}
      {isConnected && (userYes > 0n || userNo > 0n) && (
        <div className="rounded-xl px-3 py-2.5 flex items-center justify-between" style={glass.inner}>
          <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Your bets</span>
          <div className="flex gap-3 text-xs tabular-nums font-semibold">
            {userYes > 0n && <span style={{ color: 'var(--success)' }}>YES ${formatUSDC(userYes)}</span>}
            {userNo > 0n && <span style={{ color: 'var(--danger)' }}>NO ${formatUSDC(userNo)}</span>}
          </div>
        </div>
      )}

      {/* Actions */}
      {!market.resolved && !isClosed && (
        <button
          onClick={onBet}
          className="w-full rounded-xl py-3 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          Place Bet <ChevronRight className="size-4" />
        </button>
      )}

      {/* Creator resolve */}
      {isCreator && isClosed && !isExpired && !market.resolved && (
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Resolve this market:</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setResolveChoice(true)}
              className="rounded-xl py-2.5 text-sm font-bold transition-all"
              style={resolveChoice === true
                ? { background: 'rgba(26,128,71,0.12)', color: 'var(--success)', border: '1.5px solid rgba(26,128,71,0.3)' }
                : { ...glass.inner, color: 'var(--muted)' }}>
              YES
            </button>
            <button onClick={() => setResolveChoice(false)}
              className="rounded-xl py-2.5 text-sm font-bold transition-all"
              style={resolveChoice === false
                ? { background: 'rgba(186,43,76,0.08)', color: 'var(--danger)', border: '1.5px solid rgba(186,43,76,0.3)' }
                : { ...glass.inner, color: 'var(--muted)' }}>
              NO
            </button>
          </div>
          <button
            disabled={resolveChoice === null || isResolvePending || isResolveConfirming}
            onClick={handleResolve}
            className="w-full rounded-xl py-2.5 text-sm font-semibold transition-all hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {isResolvePending || isResolveConfirming
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Resolving...</span>
              : 'Confirm Resolution'}
          </button>
        </div>
      )}

      {/* Claim winnings */}
      {market.resolved && hasWinningBet && !hasClaimed && (
        <button
          disabled={isClaimPending || isClaimConfirming}
          onClick={handleClaim}
          className="w-full rounded-xl py-3 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
          style={{ background: 'var(--success)', color: 'white' }}
        >
          {isClaimPending || isClaimConfirming
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Claiming...</span>
            : 'Claim Winnings'}
        </button>
      )}

      {/* Claim refund */}
      {hasRefundableBet && !hasRefunded && (
        <button
          disabled={isClaimPending || isClaimConfirming}
          onClick={handleClaim}
          className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          <RotateCcw className="size-4" />
          {isClaimPending || isClaimConfirming ? 'Claiming...' : 'Claim Refund'}
        </button>
      )}

      {/* Explorer */}
      <a
        href={`https://explorer.testnet.arc.io/address/${PREDICTION_MARKET.address}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-xs hover:underline"
        style={{ color: 'var(--subtle)' }}
      >
        <ExternalLink className="size-3" /> View contract on ArcScan
      </a>
    </div>
  )
}
