import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SyncBeat — Listen Together',
  description: 'Create a room, upload a track, and listen in perfect sync with anyone anywhere.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
