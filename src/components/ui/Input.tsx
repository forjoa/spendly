'use client'
import React from 'react'

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input className={`border border-neutral-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 ${className}`} {...props} />
  )
}

export function Label({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return <label className={`block text-sm font-medium text-neutral-700 ${className}`}>{children}</label>
}
