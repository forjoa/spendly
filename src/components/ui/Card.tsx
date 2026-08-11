'use client'
import React from 'react'

export function Card({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`bg-white rounded-lg shadow-card border border-neutral-100 p-4 ${className}`}>
      {children}
    </div>
  )
}
