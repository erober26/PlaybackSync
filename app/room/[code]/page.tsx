'use client'
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  DragEvent,
  ChangeEvent,
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, type Room, type SyncEvent } from '@/lib/supabase'

// ── Icons (inline SVGs) ─────────────────────────────────────────────
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 ml-1">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  )
}
function VolumeIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
    </svg>
  )
}
function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  )
}
function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
      <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
    </svg>
  )
}

function formatTime(s: number): string {
  if (!isFinite(s) || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ── Main Component ──────────────────────────────────────────────────
export default function RoomPage() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()

  const [room, setRoom] = useState<Room | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [audioReady, setAudioReady] = useState(false)

  // Room meta
  const [memberCount, setMemberCount] = useState(0)
  const [connected, setConnected] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'waiting'>('waiting')

  // Upload
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Refs
  const audioRef = useRef<HTMLAudioElement>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const isOwnerRef = useRef(false)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const pendingSyncRef = useRef<SyncEvent | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Init ────────────────────────────────────────────────────────
  useEffect(() => {
    initRoom()
    return () => {
      channelRef.current?.unsubscribe()
    }
  }, [code])

  async function initRoom() {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single()

    if (error || !data) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setRoom(data)

    const storedOwner = localStorage.getItem(`owner_${code}`)
    const owner = storedOwner === data.owner_id
    setIsOwner(owner)
    isOwnerRef.current = owner

    setupChannel(data)
    setLoading(false)
  }

  function setupChannel(roomData: Room) {
    const presenceKey = crypto.randomUUID()

    const channel = supabase.channel(`room-${code}`, {
      config: { presence: { key: presenceKey } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setMemberCount(Object.keys(state).length)
      })
      .on(
        'broadcast',
        { event: 'sync' },
        ({ payload }: { payload: SyncEvent }) => {
          if (isOwnerRef.current) return
          applySyncEvent(payload)
        }
      )
      .on(
        'broadcast',
        { event: 'audio_update' },
        ({ payload }: { payload: { audioUrl: string; audioName: string } }) => {
          if (!isOwnerRef.current) {
            setRoom((prev) =>
              prev
                ? { ...prev, audio_url: payload.audioUrl, audio_name: payload.audioName }
                : prev
            )
            setAudioReady(false)
            setSyncStatus('syncing')
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            role: isOwnerRef.current ? 'owner' : 'member',
            joinedAt: Date.now(),
          })
          setConnected(true)

          // Member with an already-playing room: queue sync for when audio loads
          if (
            !isOwnerRef.current &&
            roomData.audio_url &&
            roomData.sync_state?.isPlaying
          ) {
            setSyncStatus('syncing')
            const ss = roomData.sync_state
            const elapsed = ss.updatedAt ? (Date.now() - ss.updatedAt) / 1000 : 0
            pendingSyncRef.current = {
              action: 'play',
              currentTime: ss.currentTime + elapsed,
              timestamp: Date.now(),
            }
          } else if (!isOwnerRef.current && roomData.audio_url) {
            setSyncStatus('synced')
          }
        }
      })

    channelRef.current = channel
  }

  // ── Sync logic ──────────────────────────────────────────────────
  function applySyncEvent(payload: SyncEvent) {
    const audio = audioRef.current
    if (!audio || !audioReady) {
      pendingSyncRef.current = payload
      return
    }
    const latency = (Date.now() - payload.timestamp) / 1000

    if (payload.action === 'play') {
      const target = payload.currentTime + latency
      audio.currentTime = Math.min(target, audio.duration || 9999)
      audio.play().then(() => {
        setIsPlaying(true)
        setSyncStatus('synced')
      }).catch(() => {
        // Autoplay blocked — user must interact first
        pendingSyncRef.current = payload
      })
    } else if (payload.action === 'pause') {
      audio.currentTime = payload.currentTime
      audio.pause()
      setIsPlaying(false)
      setSyncStatus('synced')
    } else if (payload.action === 'seek') {
      audio.currentTime = payload.currentTime
    }
  }

  function broadcastSync(action: SyncEvent['action'], time?: number) {
    const audio = audioRef.current
    if (!audio || !channelRef.current) return

    const payload: SyncEvent = {
      action,
      currentTime: time ?? audio.currentTime,
      timestamp: Date.now(),
    }

    channelRef.current.send({ type: 'broadcast', event: 'sync', payload })

    // Persist for late joiners
    supabase.from('rooms').update({
      sync_state: {
        isPlaying: action === 'play',
        currentTime: payload.currentTime,
        updatedAt: payload.timestamp,
      },
    }).eq('code', code)
  }

  // ── Audio element events ─────────────────────────────────────────
  function onAudioCanPlay() {
    setAudioReady(true)
    // Apply any pending sync
    if (pendingSyncRef.current) {
      const pending = pendingSyncRef.current
      pendingSyncRef.current = null
      applySyncEvent(pending)
    }
  }

  function onAudioTimeUpdate() {
    setCurrentTime(audioRef.current?.currentTime ?? 0)
  }

  function onAudioLoadedMetadata() {
    setDuration(audioRef.current?.duration ?? 0)
  }

  function onAudioEnded() {
    setIsPlaying(false)
    if (isOwner) broadcastSync('pause', 0)
  }

  // ── Owner controls ───────────────────────────────────────────────
  function handlePlay() {
    audioRef.current?.play().then(() => {
      setIsPlaying(true)
      broadcastSync('play')
    })
  }

  function handlePause() {
    audioRef.current?.pause()
    setIsPlaying(false)
    broadcastSync('pause')
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!isOwner || !progressBarRef.current || !audioRef.current || !duration) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const newTime = ratio * duration
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
    broadcastSync(isPlaying ? 'play' : 'seek', newTime)
  }

  function handleVolumeChange(e: ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value)
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
    setMuted(v === 0)
  }

  function toggleMute() {
    if (!audioRef.current) return
    const next = !muted
    setMuted(next)
    audioRef.current.muted = next
  }

  // ── File upload ──────────────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file || !room) return

    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/m4a', 'audio/x-m4a']
    if (!validTypes.some((t) => file.type.startsWith('audio/'))) {
      setUploadError('Please upload an audio file (MP3, WAV, FLAC, etc.)')
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setUploadError('File must be under 100 MB')
      return
    }

    setUploading(true)
    setUploadError('')

    try {
      const ext = file.name.split('.').pop() ?? 'mp3'
      const path = `${code}/${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('audio-files')
        .upload(path, file, { upsert: true })

      if (uploadErr) throw uploadErr

      const {
        data: { publicUrl },
      } = supabase.storage.from('audio-files').getPublicUrl(path)

      await supabase.from('rooms').update({
        audio_url: publicUrl,
        audio_name: file.name,
        sync_state: { isPlaying: false, currentTime: 0, updatedAt: Date.now() },
      }).eq('code', code)

      setRoom((prev) =>
        prev ? { ...prev, audio_url: publicUrl, audio_name: file.name } : prev
      )

      channelRef.current?.send({
        type: 'broadcast',
        event: 'audio_update',
        payload: { audioUrl: publicUrl, audioName: file.name },
      })
    } catch (e) {
      console.error(e)
      setUploadError('Upload failed. Check storage permissions or file size.')
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // ── Derived ──────────────────────────────────────────────────────
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const trackName = room?.audio_name
    ? room.audio_name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
    : null

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-end gap-[3px] h-8">
          {[14, 22, 18, 28, 20].map((h, i) => (
            <div
              key={i}
              className="eq-bar w-[3px] rounded-full bg-accent"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-2xl" style={{ fontFamily: 'var(--font-playfair)' }}>
          Room not found
        </p>
        <p className="text-muted text-sm">This room may have expired or the code is incorrect.</p>
        <button
          onClick={() => router.push('/')}
          className="mt-2 px-6 py-2.5 rounded-xl text-sm border border-border text-mutedLight hover:border-accent hover:text-accent transition-colors"
        >
          Back to home
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0E0C0B' }}>
      {/* Background glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 50% 40% at 50% 100%, rgba(232,134,74,0.06) 0%, transparent 70%)',
        }}
      />

      {/* ── Header ───────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b relative z-10"
        style={{ borderColor: '#1E1C18' }}
      >
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-text hover:opacity-70 transition-opacity"
        >
          <div className="flex items-end gap-[2px] h-5">
            {[8, 14, 10, 16, 12].map((h, i) => (
              <div
                key={i}
                className="w-[2.5px] rounded-full bg-accent"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
          <span style={{ fontFamily: 'var(--font-playfair)', fontSize: '1.1rem' }}>
            SyncBeat
          </span>
        </button>

        <div className="flex items-center gap-4">
          {/* Member count */}
          <div className="flex items-center gap-1.5 text-muted text-xs">
            <UsersIcon />
            <span>{memberCount}</span>
          </div>

          {/* Connection dot */}
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <div
              className={`w-1.5 h-1.5 rounded-full transition-colors ${connected ? 'bg-green-400' : 'bg-yellow-500 animate-pulse'}`}
            />
            <span>{connected ? 'Live' : 'Connecting…'}</span>
          </div>

          {/* Room code badge */}
          <div
            className="px-3 py-1.5 rounded-lg border text-xs"
            style={{
              fontFamily: 'var(--font-ibm-mono)',
              borderColor: '#2E2923',
              background: '#1A1714',
              color: '#9E9187',
            }}
          >
            <span className="text-muted mr-1.5">ROOM</span>
            <span className="text-text tracking-widest">{code}</span>
          </div>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 relative z-10">
        <div className="w-full max-w-lg">

          {/* Role label */}
          <p className="text-center text-xs uppercase tracking-widest text-muted mb-8 fade-in">
            {isOwner ? 'You are the room owner' : 'Listening as a guest'}
          </p>

          {/* ── Upload zone (owner, no audio yet) ── */}
          {isOwner && !room?.audio_url && (
            <div
              className={`fade-in rounded-2xl border-2 border-dashed p-12 flex flex-col items-center gap-4 cursor-pointer transition-all ${
                dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-accentDim'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-end gap-[3px] h-8">
                    {[10, 18, 14, 24, 16, 12, 20].map((h, i) => (
                      <div
                        key={i}
                        className="eq-bar w-[3px] rounded-full bg-accent"
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-muted">Uploading…</p>
                </div>
              ) : (
                <>
                  <div className="text-accent opacity-60">
                    <UploadIcon />
                  </div>
                  <div className="text-center">
                    <p className="text-text text-sm font-medium mb-1">
                      Drop your audio file here
                    </p>
                    <p className="text-muted text-xs">
                      MP3, WAV, FLAC, AAC · up to 100 MB
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {uploadError && (
            <p className="mt-3 text-center text-xs text-accent fade-in">{uploadError}</p>
          )}

          {/* ── Member waiting for audio ── */}
          {!isOwner && !room?.audio_url && (
            <div className="fade-in flex flex-col items-center gap-6 py-10">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center border"
                style={{ borderColor: '#2E2923', background: '#1A1714' }}
              >
                <div className="flex items-end gap-[3px] h-8">
                  {[8, 16, 12, 20, 14].map((h, i) => (
                    <div
                      key={i}
                      className="w-[3px] rounded-full"
                      style={{
                        height: `${h}px`,
                        background: '#2E2923',
                        animation: 'pulse 2s ease-in-out infinite',
                        animationDelay: `${i * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="text-center">
                <p className="text-text text-sm font-medium mb-1">
                  Waiting for the room owner to upload a track…
                </p>
                <p className="text-muted text-xs">
                  You'll sync up automatically when they do.
                </p>
              </div>
            </div>
          )}

          {/* ── Audio Player ── */}
          {room?.audio_url && (
            <div
              className="fade-in rounded-2xl border overflow-hidden"
              style={{ background: '#1A1714', borderColor: '#2E2923' }}
            >
              {/* Hidden audio element */}
              <audio
                ref={audioRef}
                src={room.audio_url}
                onCanPlay={onAudioCanPlay}
                onTimeUpdate={onAudioTimeUpdate}
                onLoadedMetadata={onAudioLoadedMetadata}
                onEnded={onAudioEnded}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                preload="auto"
              />

              {/* Track info */}
              <div className="px-7 pt-7 pb-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-text text-lg truncate mb-0.5"
                      style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic' }}
                    >
                      {trackName ?? 'Untitled Track'}
                    </p>
                    <p className="text-muted text-xs">
                      {isOwner ? 'You · Room Owner' : 'Synced Playback'}
                    </p>
                  </div>

                  {/* Sync status pill */}
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs shrink-0 mt-0.5"
                    style={{ background: '#252119', color: '#9E9187' }}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        syncStatus === 'synced'
                          ? 'bg-green-400'
                          : syncStatus === 'syncing'
                          ? 'bg-yellow-400 animate-pulse'
                          : 'bg-border'
                      }`}
                    />
                    {syncStatus === 'synced' && 'In Sync'}
                    {syncStatus === 'syncing' && 'Syncing…'}
                    {syncStatus === 'waiting' && 'Waiting'}
                  </div>
                </div>

                {/* EQ animation when playing */}
                {isPlaying && (
                  <div className="flex items-end gap-[3px] mt-4 h-5">
                    {[8, 14, 10, 18, 12, 16, 9].map((h, i) => (
                      <div
                        key={i}
                        className="eq-bar w-[3px] rounded-full bg-accent opacity-60"
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>
                )}
                {!isPlaying && (
                  <div className="mt-4 h-5 flex items-end gap-[3px]">
                    {[8, 14, 10, 18, 12, 16, 9].map((h, i) => (
                      <div
                        key={i}
                        className="w-[3px] rounded-full bg-border"
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div className="px-7 pb-2">
                <div
                  ref={progressBarRef}
                  className={`relative h-1.5 rounded-full overflow-hidden ${isOwner ? 'cursor-pointer' : ''}`}
                  style={{ background: '#2E2923' }}
                  onClick={handleProgressClick}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-none"
                    style={{ width: `${progressPercent}%`, background: '#E8864A' }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span
                    className="text-muted text-xs tabular-nums"
                    style={{ fontFamily: 'var(--font-ibm-mono)' }}
                  >
                    {formatTime(currentTime)}
                  </span>
                  <span
                    className="text-muted text-xs tabular-nums"
                    style={{ fontFamily: 'var(--font-ibm-mono)' }}
                  >
                    {formatTime(duration)}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="px-7 pb-7 flex items-center gap-5">
                {/* Play / Pause */}
                {isOwner ? (
                  <button
                    onClick={isPlaying ? handlePause : handlePlay}
                    disabled={!audioReady}
                    className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                    style={{ background: '#E8864A', color: '#0E0C0B' }}
                  >
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                  </button>
                ) : (
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: '#252119', color: '#4A4238' }}
                  >
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                  </div>
                )}

                {/* Volume */}
                <div className="flex items-center gap-2 flex-1">
                  <button onClick={toggleMute} className="text-muted hover:text-text transition-colors">
                    <VolumeIcon muted={muted} />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={muted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="flex-1"
                    style={{ accentColor: '#E8864A' }}
                  />
                </div>
              </div>

              {/* Owner: change track */}
              {isOwner && (
                <div
                  className="px-7 pb-5 pt-0 border-t flex items-center justify-between"
                  style={{ borderColor: '#2E2923' }}
                >
                  <span className="text-muted text-xs">Want to change the track?</span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-xs text-accent hover:underline disabled:opacity-50"
                  >
                    {uploading ? 'Uploading…' : 'Upload new file'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Share code card */}
          {isOwner && (
            <div
              className="fade-in mt-4 rounded-xl px-5 py-4 flex items-center justify-between border"
              style={{ background: '#1A1714', borderColor: '#2E2923' }}
            >
              <div>
                <p className="text-xs text-muted uppercase tracking-widest mb-0.5">Share this code</p>
                <p
                  className="text-text text-2xl tracking-[0.3em]"
                  style={{ fontFamily: 'var(--font-ibm-mono)' }}
                >
                  {code}
                </p>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(code)}
                className="px-4 py-2 rounded-lg border text-xs text-mutedLight hover:border-accent hover:text-accent transition-colors"
                style={{ borderColor: '#2E2923' }}
              >
                Copy
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
