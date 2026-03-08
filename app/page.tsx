'use client'
import { useState, useRef, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export default function Home() {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Join code input ──────────────────────────────────────────────
  function handleDigitChange(index: number, value: string) {
    const clean = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = clean
    setDigits(next)
    setError('')
    if (clean && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleDigitKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'Enter') handleJoin()
  }

  function handleDigitPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length > 0) {
      const next = pasted.split('')
      while (next.length < 6) next.push('')
      setDigits(next)
      inputRefs.current[Math.min(pasted.length, 5)]?.focus()
    }
  }

  // ── Actions ──────────────────────────────────────────────────────
  async function handleCreate() {
    setCreating(true)
    setError('')
    try {
      const code = generateCode()
      const ownerId = crypto.randomUUID()

      const { error: dbError } = await supabase.from('rooms').insert({
        code,
        owner_id: ownerId,
        sync_state: { isPlaying: false, currentTime: 0, updatedAt: null },
      })

      if (dbError) throw dbError

      localStorage.setItem(`owner_${code}`, ownerId)
      router.push(`/room/${code}`)
    } catch {
      setError('Could not create room — check your connection and try again.')
      setCreating(false)
    }
  }

  async function handleJoin() {
    const code = digits.join('')
    if (code.length !== 6) {
      setError('Enter all 6 digits')
      return
    }
    setJoining(true)
    setError('')
    try {
      const { data, error: dbError } = await supabase
        .from('rooms')
        .select('code')
        .eq('code', code)
        .single()

      if (dbError || !data) {
        setError('Room not found — double-check the code.')
        setJoining(false)
        return
      }

      router.push(`/room/${code}`)
    } catch {
      setError('Could not join room — try again.')
      setJoining(false)
    }
  }

  const joinCode = digits.join('')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">

      {/* Background radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(232,134,74,0.08) 0%, transparent 70%)',
        }}
      />

      {/* Grid lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(#F2EDE6 1px, transparent 1px), linear-gradient(90deg, #F2EDE6 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Logo / title */}
      <div className="text-center mb-14 fade-in">
        <div className="flex items-center justify-center gap-3 mb-3">
          {/* Waveform icon */}
          <div className="flex items-end gap-[3px] h-7">
            {[14, 22, 18, 28, 20, 16, 24].map((h, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full bg-accent"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
          <h1
            className="text-4xl md:text-5xl text-text"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            SyncBeat
          </h1>
        </div>
        <p className="text-muted text-sm tracking-widest uppercase">
          Listen together · In perfect sync
        </p>
      </div>

      {/* Cards */}
      <div className="w-full max-w-3xl grid md:grid-cols-2 gap-4">

        {/* ── Create Room ── */}
        <div
          className="fade-in fade-in-delay-1 rounded-2xl p-8 flex flex-col gap-6 border border-border"
          style={{ background: '#1A1714' }}
        >
          <div>
            <h2
              className="text-xl text-text mb-1"
              style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic' }}
            >
              Start a Room
            </h2>
            <p className="text-muted text-sm leading-relaxed">
              Create a private session. Upload a track and share the code — everyone hears the same moment.
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center">
            {/* Decorative vinyl disc */}
            <div
              className="w-24 h-24 rounded-full border-4 flex items-center justify-center relative"
              style={{ borderColor: '#2E2923', background: '#0E0C0B' }}
            >
              <div
                className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: '#E8864A', background: '#1A1714' }}
              >
                <div className="w-2 h-2 rounded-full bg-accent" />
              </div>
              {/* Grooves */}
              {[36, 44, 52].map((s) => (
                <div
                  key={s}
                  className="absolute rounded-full border border-border opacity-40"
                  style={{ width: s, height: s }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full py-3.5 rounded-xl font-medium text-sm tracking-wide transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: '#E8864A', color: '#0E0C0B' }}
          >
            {creating ? 'Creating…' : 'Create Room'}
          </button>
        </div>

        {/* ── Join Room ── */}
        <div
          className="fade-in fade-in-delay-2 rounded-2xl p-8 flex flex-col gap-6 border border-border"
          style={{ background: '#1A1714' }}
        >
          <div>
            <h2
              className="text-xl text-text mb-1"
              style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic' }}
            >
              Join a Room
            </h2>
            <p className="text-muted text-sm leading-relaxed">
              Got a 6-digit code? Enter it below to instantly sync up with the room.
            </p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <p className="text-mutedLight text-xs uppercase tracking-widest">Room Code</p>
            <div className="flex gap-2" onPaste={handleDigitPaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el }}
                  className="code-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(i, e)}
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleJoin}
            disabled={joining || joinCode.length !== 6}
            className="w-full py-3.5 rounded-xl font-medium text-sm tracking-wide transition-all active:scale-[0.98] disabled:opacity-40 border"
            style={{ borderColor: '#E8864A', color: '#E8864A', background: 'transparent' }}
          >
            {joining ? 'Joining…' : 'Join Room'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mt-6 px-5 py-3 rounded-xl text-sm fade-in"
          style={{ background: 'rgba(232,134,74,0.12)', color: '#E8864A', border: '1px solid rgba(232,134,74,0.25)' }}
        >
          {error}
        </div>
      )}

      {/* Footer */}
      <p className="absolute bottom-6 text-xs" style={{ color: '#3E3830' }}>
        Rooms expire after 24 hours · No account needed
      </p>
    </main>
  )
}
