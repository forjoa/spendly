'use client'
import React from 'react'

export default function Topbar({ onMenu }: { onMenu?: () => void }) {
  return (
    <header className="w-full border-b border-neutral-100 bg-white">
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-2 rounded-md hover:bg-neutral-100" onClick={onMenu} aria-label="Open navigation">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" stroke="#0b1220" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary-500 rounded-md flex items-center justify-center text-white font-semibold">S</div>
              <span className="font-semibold">Spendly</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-md hover:bg-neutral-100" aria-label="Open help">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path d="M12 17h.01M12 6a4 4 0 100 8" stroke="#0b1220" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-700">J</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
