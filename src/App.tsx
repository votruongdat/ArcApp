import { useState, useCallback } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useReadContracts } from 'wagmi'
import { PREDICTION_MARKET } from './contract'
import { MarketCard } from './components/MarketCard'
import { MarketDetail } from './components/MarketDetail'
import { CreateMarketSheet } from './components/CreateMarketSheet'
import { BetSheet } from './components/BetSheet'
import type { MarketData } from './components/types'

const ARC_TESTNET_ID = 5042002
const MODULE_LOAD_SEC = Math.floor(performance.timeOrigin / 1000 + performance.now() / 1000)

export default function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [betOpen, setBetOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  // Read market count
  const { data: countData } = useReadContracts({
    contracts: [{
      ...PREDICTION_MARKET,
      functionName: 'marketCount',
      chainId: ARC_TESTNET_ID,
    }],
    query: { refetchInterval: 10_000 },
  })
  const marketCount = countData?.[0]?.result !== undefined ? Number(countData[0].result) : 0

  // Build contracts array for each market (getMarket + marketQuestion)
  const marketContracts = Array.from({ length: marketCount }, (_, i) => [
    { ...PREDICTION_MARKET, functionName: 'getMarket' as const, args: [BigInt(i)], chainId: ARC_TESTNET_ID },
    { ...PREDICTION_MARKET, functionName: 'marketQuestion' as const, args: [BigInt(i)], chainId: ARC_TESTNET_ID },
  ]).flat()

  const { data: marketData, refetch: refetchMarkets, isLoading } = useReadContracts({
    contracts: marketContracts,
    query: { enabled: marketCount > 0, refetchInterval: 15_000 },
  })

  // Parse markets
  const markets: MarketData[] = []
  if (marketData) {
    for (let i = 0; i < marketCount; i++) {
      const raw = marketData[i * 2]?.result as {
        creator: string
        deadline: bigint
        resolutionDeadline: bigint
        outcome: bigint
        resolved: boolean
        yesTotal: bigint
        noTotal: bigint
        feeAmount: bigint
        distributablePot: bigint
      } | undefined
      const question = marketData[i * 2 + 1]?.result as string | undefined
      if (raw && question !== undefined) {
        markets.push({ id: i, question, ...raw })
      }
    }
  }

  // Show newest first
  const sortedMarkets = [...markets].reverse()
  const selectedMarket = selectedId !== null ? markets.find((m) => m.id === selectedId) ?? null : null

  const handleRefresh = () => {
    void refetchMarkets()
    refresh()
  }

  return (
    <div className="relative min-h-dvh overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #f9f9fc 0%, #fffcf7 52%, #fbf7f2 100%)' }}>
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '8%', left: '5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '8%', right: '8%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)', filter: 'blur(58px)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-10 pt-5">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Predict</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>USDC prediction markets on Arc</p>
          </div>
          <ConnectKitButton />
        </header>

        {/* Stats banner */}
        <div className="rounded-2xl px-5 py-3 mb-5 flex items-center justify-between"
          style={{ background: 'rgba(255,255,255,0.64)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.68)', boxShadow: '0 8px 32px rgba(18,45,69,0.08)' }}>
          <div className="text-center">
            <p className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{marketCount}</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Markets</p>
          </div>
          <div className="w-px h-8" style={{ background: 'var(--border)' }} />
          <div className="text-center">
            <p className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              ${markets.reduce((sum, m) => sum + Number(m.yesTotal + m.noTotal) / 1_000_000, 0).toFixed(0)}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Total Pooled</p>
          </div>
          <div className="w-px h-8" style={{ background: 'var(--border)' }} />
          <div className="text-center">
            <p className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {markets.filter((m) => !m.resolved && MODULE_LOAD_SEC < Number(m.deadline)).length}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Active</p>
          </div>
        </div>

        {/* Market detail */}
        {selectedMarket && (
          <div className="mb-4">
            <MarketDetail
              key={`${selectedMarket.id}-${refreshKey}`}
              market={selectedMarket}
              onRefresh={handleRefresh}
              onBet={() => setBetOpen(true)}
            />
          </div>
        )}

        {/* Markets list */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--muted)', letterSpacing: '0.07em' }}>
            {selectedId !== null ? 'All Markets' : 'Markets'}
          </h2>
          <button onClick={handleRefresh}
            className="rounded-full p-1.5 hover:bg-black/5 transition-colors">
            <RefreshCw className="size-3.5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="space-y-2.5">
          {isLoading && marketCount > 0 && (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl h-24 animate-pulse" style={{ background: 'rgba(255,255,255,0.5)' }} />
            ))
          )}
          {!isLoading && sortedMarkets.map((m) => (
            <MarketCard
              key={m.id}
              market={m}
              selected={selectedId === m.id}
              onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
            />
          ))}
          {!isLoading && marketCount === 0 && (
            <div className="rounded-2xl p-8 text-center"
              style={{ background: 'rgba(255,255,255,0.64)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.68)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>No markets yet</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Create the first prediction market below.</p>
            </div>
          )}
        </div>

        {/* Create button */}
        <button
          onClick={() => setCreateOpen(true)}
          className="mt-5 w-full rounded-2xl py-3.5 text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: 'var(--accent)' }}
        >
          <Plus className="size-4" /> New Market
        </button>
      </div>

      <CreateMarketSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleRefresh}
      />

      <BetSheet
        open={betOpen}
        onClose={() => setBetOpen(false)}
        onBetPlaced={handleRefresh}
        market={selectedMarket}
      />
    </div>
  )
}
