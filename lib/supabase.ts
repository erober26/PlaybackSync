import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 20 } },
})

export type Room = {
  id: string
  code: string
  owner_id: string
  audio_url: string | null
  audio_name: string | null
  sync_state: {
    isPlaying: boolean
    currentTime: number
    updatedAt: number | null
  } | null
  created_at: string
}

export type SyncEvent = {
  action: 'play' | 'pause' | 'seek'
  currentTime: number
  timestamp: number
}
