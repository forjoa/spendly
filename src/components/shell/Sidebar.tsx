'use client'
import React from 'react'

const NavItem = ({ children, label }: { children: React.ReactNode, label: string }) => (
  <div className="py-2">
    <a className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-300" href="#" aria-label={label}>
      {children}
      <span className="text-sm text-neutral-700">{label}</span>
    </a>
  </div>
)

export default function Sidebar() {
  return (
    <nav className="p-4">
      <div className="mb-6">
        <h3 className="text-xs font-medium text-neutral-500 uppercase">Workspace</h3>
        <p className="mt-2 text-sm text-neutral-600">Personal</p>
      </div>
      <div className="space-y-1">
        <NavItem label="Overview">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M3 13h8V3H3v10zM13 21h8V11h-8v10zM13 3v6h8V3h-8zM3 21h8v-6H3v6z" stroke="#0b1220" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavItem>
        <NavItem label="Transactions">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M12 8v8M8 12h8" stroke="#0b1220" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavItem>
        <NavItem label="Integrations">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M3 12h18M12 3v18" stroke="#0b1220" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </NavItem>
      </div>

      <div className="mt-8">
        <h4 className="text-xs font-medium text-neutral-500 uppercase">Settings</h4>
        <div className="mt-2">
          <a className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-neutral-50" href="#">Billing</a>
        </div>
      </div>
    </nav>
  )
}
