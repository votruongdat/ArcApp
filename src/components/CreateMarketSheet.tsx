import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { PREDICTION_MARKET } from '../contract'
import { buildTxExplorerUrl } from '@/onchain-facts'

const ARC_TESTNET_ID = 5042002
const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

const glass = {
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

const springs = {
  sheet: { type: 'spring' as const, stiffness: 380, damping: 40 },
}

interface CreateMarketSheetProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreateMarketSheet({ open, onClose, onCreated }: CreateMarketSheetProps) {
  const { isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [question, setQuestion] = useState('')
  const [daysUntilDeadline, setDaysUntilDeadline] = useState('7')
  const [resolutionDays, setResolutionDays] = useState('2')

  const { writeContract, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const isWrongChain = isConnected && chainId !== ARC_TESTNET_ID

  const handleSubmit = () => {
    if (!isConnected) return
    if (isWrongChain) {
      switchChain({ chainId: ARC_TESTNET_ID })
      return
    }
    if (!question.trim()) return
    const days = parseFloat(daysUntilDeadline)
    const resDays = parseFloat(resolutionDays)
    if (isNaN(days) || days < 1 || isNaN(resDays) || resDays < 1) return

    const now = Math.floor(Date.now() / 1000)
    const deadline = BigInt(now + Math.floor(days * 86400))
    const resWindow = BigInt(Math.floor(resDays * 86400))

    writeContract({
      ...PREDICTION_MARKET,
      functionName: 'createMarket',
      args: [question.trim(), deadline, resWindow],
    }, {
      onSuccess: () => {
        toast.success('Market creation submitted')
      },
      onError: (err) => {
        const msg = err.message?.toLowerCase() || ''
        if (!msg.includes('user rejected')) {
          toast.error('Failed to create market')
        }
      },
    })
  }

  const handleSuccess = () => {
    if (hash) {
      toast.success('Market created!', {
        description: 'View on ArcScan',
        action: {
          label: 'View',
          onClick: () => window.open(buildTxExplorerUrl(ARC_TESTNET_ID, hash), '_blank'),
        },
      })
    }
    setQuestion('')
    setDaysUntilDeadline('7')
    setResolutionDays('2')
    reset()
    onCreated()
    onClose()
  }

  if (isSuccess && hash) {
    setTimeout(handleSuccess, 300)
  }

  const ready = isConnected && question.trim().length >= 10 && !isPending && !isConfirming

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: spectral }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>
            <div className="px-5 pb-7 pt-3">
              <div className="flex items-center justify-between mb-5">
                <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>New Market</h2>
                <button onClick={onClose} className="rounded-full p-1.5 hover:bg-black/5 transition-colors">
                  <X className="size-4" style={{ color: 'var(--muted)' }} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)', letterSpacing: '0.07em' }}>
                    Question
                  </label>
                  <div className="rounded-xl p-3" style={glass.inner}>
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Will BTC reach $100k by end of year?"
                      rows={2}
                      className="w-full bg-transparent text-sm outline-none resize-none placeholder:opacity-40"
                      style={{ color: 'var(--ink)' }}
                    />
                  </div>
                  <p className="text-xs mt-1 tabular-nums" style={{ color: question.length < 10 && question.length > 0 ? 'var(--danger)' : 'var(--subtle)' }}>
                    {question.length}/200 chars {question.length < 10 ? '(min 10)' : ''}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)', letterSpacing: '0.07em' }}>
                      Deadline
                    </label>
                    <div className="rounded-xl p-3 flex items-center gap-2" style={glass.inner}>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={daysUntilDeadline}
                        onChange={(e) => setDaysUntilDeadline(e.target.value)}
                        className="flex-1 bg-transparent text-sm font-semibold outline-none tabular-nums w-12"
                        style={{ color: 'var(--ink)' }}
                      />
                      <span className="text-xs" style={{ color: 'var(--subtle)' }}>days</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)', letterSpacing: '0.07em' }}>
                      Resolution window
                    </label>
                    <div className="rounded-xl p-3 flex items-center gap-2" style={glass.inner}>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={resolutionDays}
                        onChange={(e) => setResolutionDays(e.target.value)}
                        className="flex-1 bg-transparent text-sm font-semibold outline-none tabular-nums w-12"
                        style={{ color: 'var(--ink)' }}
                      />
                      <span className="text-xs" style={{ color: 'var(--subtle)' }}>days</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                  You can resolve this market after the deadline, within your resolution window.
                </p>
              </div>

              <button
                disabled={!ready}
                onClick={handleSubmit}
                className="mt-5 w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {!isConnected ? 'Connect Wallet'
                  : isWrongChain ? 'Switch to Arc Testnet'
                  : isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Confirm in wallet...
                    </span>
                  ) : isConfirming ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Creating market...
                    </span>
                  ) : 'Create Market'}
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
