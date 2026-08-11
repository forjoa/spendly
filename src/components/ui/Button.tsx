'use client'
import React from 'react'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'destructive'
}

export default function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2'
  const variants: Record<string, string> = {
    primary: 'bg-primary-500 text-white hover:brightness-95 focus:ring-primary-300',
    ghost: 'bg-transparent text-neutral-700 hover:bg-neutral-50 focus:ring-primary-300',
    destructive: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-300'
  }

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
