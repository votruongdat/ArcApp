import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { parseAmount, Amount, usdcDecimalsFor } from '@/onchain-money'
import { PREDICTION_MARKET } from '../contract'
import type { MarketData } from './types'

const ARC_TESTNET_ID = 5042002
const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'
const springs = { sheet: { type: 'spring' as const, stiffness: 380, damping: 40 } }

const glass = {
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

const USDC_ADDRESS = getUsdc(ARC_TESTNET_ID)?.address as `0x${string}`

interface BetSheetProps {
  open: boolean
  onClose: () => void
  onBetPlaced: () => void
  market: MarketData | null
}

const QUICK_AMOUNTS = ['1', '5', '10', '25', '50']

export function BetSheet({ open, onClose, onBetPlaced, market }: BetSheetProps) {
  const { isConnected, address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [side, setSide] = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('')

  const isWrongChain = isConnected && chainId !== ARC_TESTNET_ID

  // Live USDC balance
  const { data: rawBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address },
  })
  const formattedBalance = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2)
    : undefined

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, PREDICTION_MARKET.address] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address },
  })

  const { writeContract: approve, data: approveHash, isPending: isApprovePending } = useWriteContract()
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  const { writeContract: bet, data: betHash, isPending: isBetPending, reset: resetBet } = useWriteContract()
  const { isLoading: isBetConfirming, isSuccess: isBetSuccess } = useWaitForTransactionReceipt({ hash: betHash })

  if (isApproveSuccess) {
    void refetchAllowance()
  }

  const parsedAmount = (() => {
    try {
      if (!amount || parseFloat(amount) <= 0) return null
      return parseAmount(ARC_TESTNET_ID, amount)
    } catch { return null }
  })()

  const needsApproval = parsedAmount && allowance !== undefined && allowance < parsedAmount.raw
  const isProcessing = isApprovePending || isApproveConfirming || isBetPending || isBetConfirming
  const ready = isConnected && !isWrongChain && !!parsedAmount && !isProcessing && market !== null

  const handleAction = () => {
    if (!isConnected || !parsedAmount || !market) return
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }

    if (needsApproval) {
      approve({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PREDICTION_MARKET.address, parsedAmount.raw],
      }, {
        onError: (err) => {
          const msg = err.message?.toLowerCase() || ''
          if (!msg.includes('user rejected')) toast.error('Approval failed')
        },
      })
      return
    }

    bet({
      ...PREDICTION_MARKET,
      functionName: 'placeBet',
      args: [BigInt(market.id), side === 'yes', parsedAmount.raw],
    }, {
      onSuccess: () => toast.success('Bet submitted'),
      onError: (err) => {
        const msg = err.message?.toLowerCase() || ''
        if (!msg.includes('user rejected')) toast.error('Bet failed')
      },
    })
  }

  if (isBetSuccess && betHash) {
    toast.success('Bet placed!', {
      description: `${amount} USDC on ${side.toUpperCase()}`,
      action: {
        label: 'View',
        onClick: () => window.open(buildTxExplorerUrl(ARC_TESTNET_ID, betHash), '_blank'),
      },
    })
    setAmount('')
    resetBet()
    onBetPlaced()
    onClose()
  }

  const totalPool = market ? market.yesTotal + market.noTotal : 0n
  const yesPercent = totalPool > 0n && market ? Math.round(Number(market.yesTotal * 100n) / Number(totalPool)) : 50
  const potentialPayout = parsedAmount && totalPool > 0n && market
    ? side === 'yes'
      ? Number(parsedAmount.raw) / Number(market.yesTotal + parsedAmount.raw) * (Number(totalPool + parsedAmount.raw) * 0.98)
      : Number(parsedAmount.raw) / Number(market.noTotal + parsedAmount.raw) * (Number(totalPool + parsedAmount.raw) * 0.98)
    : null

  const ctaLabel = !isConnected ? 'Connect Wallet'
    : isWrongChain ? 'Switch to Arc Testnet'
    : isApprovePending ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm approval...</span>
    : isApproveConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Approving USDC...</span>
    : isBetPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm in wallet...</span>
    : isBetConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Placing bet...</span>
    : needsApproval ? `Approve USDC`
    : `Bet ${side.toUpperCase()}`

  return (
    <AnimatePresence>
      {open && market && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: spectral }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>
            <div className="px-5 pb-7 pt-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>Place Bet</h2>
                <button onClick={onClose} className="rounded-full p-1.5 hover:bg-black/5 transition-colors">
                  <X className="size-4" style={{ color: 'var(--muted)' }} />
                </button>
              </div>
              <p className="text-xs mb-5 leading-relaxed" style={{ color: 'var(--muted)' }}>{market.question}</p>

              {/* Side selector */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setSide('yes')}
                  className="rounded-xl py-3 text-sm font-bold transition-all"
                  style={side === 'yes'
                    ? { background: 'rgba(26,128,71,0.12)', color: 'var(--success)', border: '1.5px solid rgba(26,128,71,0.3)' }
                    : { ...glass.inner, color: 'var(--muted)' }}
                >
                  <span className="flex items-center justify-center gap-2">
                    <TrendingUp className="size-4" /> YES {yesPercent}%
                  </span>
                </button>
                <button
                  onClick={() => setSide('no')}
                  className="rounded-xl py-3 text-sm font-bold transition-all"
                  style={side === 'no'
                    ? { background: 'rgba(186,43,76,0.08)', color: 'var(--danger)', border: '1.5px solid rgba(186,43,76,0.3)' }
                    : { ...glass.inner, color: 'var(--muted)' }}
                >
                  <span className="flex items-center justify-center gap-2">
                    <TrendingDown className="size-4" /> NO {100 - yesPercent}%
                  </span>
                </button>
              </div>

              {/* Amount input */}
              <div className="rounded-2xl p-4 mb-3" style={glass.inner}>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, '')
                    if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                  }}
                  placeholder="0.00"
                  className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:opacity-25"
                  style={{ color: 'var(--ink)' }}
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</span>
                  <button
                    disabled={!formattedBalance}
                    onClick={() => formattedBalance && setAmount(formattedBalance)}
                    className="text-xs font-semibold disabled:opacity-40"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    {formattedBalance ? `Balance: ${formattedBalance} · Max` : 'Connect to view balance'}
                  </button>
                </div>
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {QUICK_AMOUNTS.map((q) => (
                  <button key={q} onClick={() => setAmount(q)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                    style={amount === q
                      ? { background: 'var(--accent)', color: 'white' }
                      : { background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
                    ${q}
                  </button>
                ))}
              </div>

              {/* Payout preview */}
              {potentialPayout !== null && (
                <div className="rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between" style={glass.inner}>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>Est. payout if {side.toUpperCase()} wins</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--success)' }}>
                    ${(potentialPayout / 1_000_000).toFixed(2)}
                  </span>
                </div>
              )}

              <button
                disabled={!ready}
                onClick={handleAction}
                className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: side === 'yes' ? 'var(--success)' : 'var(--danger)' }}
              >
                {ctaLabel}
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
