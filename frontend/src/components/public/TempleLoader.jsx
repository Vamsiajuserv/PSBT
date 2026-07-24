import React from 'react'

// Devotional loading screen shown while the public site content is fetched.
// A haloed Sai Baba portrait with a pulsing golden aura, slow-rotating light
// rays, drifting sparks and the "Om Sri Sai Ram" mantra. Purely decorative.
export default function TempleLoader({ label = 'Loading temple information…' }) {
  return (
    <div className="temple-loader min-h-screen grid place-items-center overflow-hidden relative">
      {/* Soft mandala watermark behind everything */}
      <div className="loader-mandala absolute inset-0 pointer-events-none" />

      {/* Drifting sparks */}
      {[
        { l: '18%', d: '0s' }, { l: '32%', d: '1.3s' }, { l: '50%', d: '2.6s' },
        { l: '66%', d: '0.7s' }, { l: '82%', d: '1.9s' },
      ].map((s, i) => (
        <span key={i} className="loader-spark" style={{ left: s.l, animationDelay: s.d }} />
      ))}

      <div className="relative flex flex-col items-center px-6 text-center">
        {/* Mantra above */}
        <div className="font-script text-3xl sm:text-4xl text-gold-300 mb-6 loader-fade" style={{ animationDelay: '.1s' }}>
          || Om Sri Sai Ram ||
        </div>

        {/* Haloed portrait */}
        <div className="relative w-40 h-40 sm:w-48 sm:h-48 grid place-items-center">
          {/* Rotating light rays */}
          <div className="loader-rays absolute inset-[-30%]" aria-hidden="true" />
          {/* Pulsing golden halo */}
          <span className="loader-halo absolute inset-0 rounded-full" aria-hidden="true" />
          {/* Rotating gold ring */}
          <span className="loader-ring absolute inset-[-8px] rounded-full" aria-hidden="true" />
          {/* Portrait */}
          <img
            src="/images/sai/goldfull.jpg"
            alt="Sri Shirdi Sai Baba"
            className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-gold-300 shadow-[0_0_40px_rgba(212,175,55,0.55)] loader-breathe"
          />
        </div>

        {/* Sloka */}
        <div className="font-telugu text-gold-200/90 text-sm sm:text-base mt-6 loader-fade" style={{ animationDelay: '.3s' }}>
          శ్రద్ధ · సబూరి
        </div>

        {/* Loading label + dots */}
        <div className="flex items-center gap-1.5 text-cream/70 text-xs sm:text-sm mt-4 loader-fade" style={{ animationDelay: '.5s' }}>
          <span>{label}</span>
          <span className="loader-dot" style={{ animationDelay: '0s' }}>.</span>
          <span className="loader-dot" style={{ animationDelay: '.2s' }}>.</span>
          <span className="loader-dot" style={{ animationDelay: '.4s' }}>.</span>
        </div>
      </div>
    </div>
  )
}
