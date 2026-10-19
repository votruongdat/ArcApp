import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import type { MarketData } from './types'

// Module-level constant: seconds since epoch at module load time (pure from React's perspective)
const MODULE_LOAD_SEC = Math.floor(performance.timeOrigin / 1000 + performance.now() / 1000)

interface MarketCardProps {
  market: MarketData
  onSelect: (id: number) => void
  selected?: boolean
}

const glass = {
  card: {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
}

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

function formatTimeLeft(deadline: bigint): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = Number(deadline) - now
  if (diff <= 0) return 'Closed'
  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  if (days > 0) return `${days}d ${hours}h left`
  const mins = Math.floor((diff % 3600) / 60)
  if (hours > 0) return `${hours}h ${mins}m left`
  return `${mins}m left`
}

function formatUSDC(raw: bigint): string {
  const val = Number(raw) / 1_000_000
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`
  return `$${val.toFixed(2)}`
}

export function MarketCard({ market, onSelect, selected }: MarketCardProps) {
  const totalPool = market.yesTotal + market.noTotal
  const yesPercent = totalPool > 0n ? Math.round(Number(market.yesTotal * 100n) / Number(totalPool)) : 50
  const noPercent = 100 - yesPercent
  const isClosed = MODULE_LOAD_SEC > Number(market.deadline)
  const isResolved = market.resolved

  const statusIcon = isResolved
    ? market.outcome === 1n
      ? <CheckCircle className="size-3.5" style={{ color: 'var(--success)' }} />
      : <XCircle className="size-3.5" style={{ color: 'var(--danger)' }} />
    : isClosed
    ? <AlertCircle className="size-3.5" style={{ color: 'var(--muted)' }} />
    : <Clock className="size-3.5" style={{ color: 'var(--accent-hover)' }} />

  const statusLabel = isResolved
    ? market.outcome === 1n ? 'YES won' : 'NO won'
    : isClosed ? 'Awaiting resolution'
    : formatTimeLeft(market.deadline)

  return (
    <button
      onClick={() => onSelect(market.id)}
      className="w-full text-left rounded-2xl p-4 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
      style={{
        ...glass.card,
        ...(selected ? { borderColor: 'rgba(18,45,69,0.35)', boxShadow: '0 0 0 2px rgba(18,45,69,0.15), 0 8px 32px rgba(18,45,69,0.08)' } : {}),
      }}
    >
      {selected && <div className="h-0.5 rounded-full -mt-4 -mx-4 mb-3" style={{ background: spectral }} />}
      {selected && <div className="mt-2" />}

      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold leading-snug flex-1" style={{ color: 'var(--ink)' }}>
          {market.question}
        </p>
        <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
          {statusIcon}
          {statusLabel}
        </span>
      </div>

      {/* YES/NO bar */}
      <div className="rounded-full overflow-hidden h-2 mb-2" style={{ background: 'rgba(18,45,69,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${yesPercent}%`, background: 'linear-gradient(90deg, var(--success), #3baa6b)' }}
        />
      </div>

      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
        <span className="font-semibold tabular-nums" style={{ color: 'var(--success)' }}>YES {yesPercent}%</span>
        <span className="tabular-nums">Pool: {formatUSDC(totalPool)} USDC</span>
        <span className="font-semibold tabular-nums" style={{ color: 'var(--danger)' }}>NO {noPercent}%</span>
      </div>
    </button>
  )
}
