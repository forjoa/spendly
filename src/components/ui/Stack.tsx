'use client'
import React from 'react'

export function Stack({ children, gap = 3 }: { children: React.ReactNode, gap?: number }) {
  const cls = `flex flex-col gap-${gap}`
  return <div className={cls}>{children}</div>
}
