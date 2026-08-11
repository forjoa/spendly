'use client'

import React from 'react'
import Topbar from './Topbar'
import Sidebar from './Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="flex">
        <aside className="hidden md:block md:w-72 border-r border-neutral-100 bg-white">
          <Sidebar />
        </aside>
        <div className="flex-1">
          <Topbar onMenu={() => setOpen(true)} />
          <div className="pt-4 md:pt-6">
            {children}
          </div>
        </div>
      </div>

      {/* Mobile slide-over */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-80 bg-white shadow-lg p-4 overflow-auto">
            <div className="flex justify-end">
              <button className="p-2 rounded-md hover:bg-neutral-100" onClick={() => setOpen(false)} aria-label="Close navigation">Close</button>
            </div>
            <Sidebar />
          </div>
        </div>
      )}
    </div>
  )
}
