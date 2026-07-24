import React from 'react'

// Simple loading screen shown while the public site content is fetched — the
// temple seal on a maroon ground with a gentle pulse. Nothing more.
export default function TempleLoader({ label = 'Loading…' }) {
  return (
    <div className="temple-loader min-h-screen grid place-items-center">
      <div className="flex flex-col items-center gap-5">
        <img src="/images/temple-logo.png" alt="Sri Shirdi Sai Baba Temple"
             className="w-24 h-24 loader-pulse" />
        <div className="text-cream/70 text-sm">{label}</div>
      </div>
    </div>
  )
}
