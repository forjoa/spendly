import React from 'react'
import AppShell from '../components/shell/AppShell'

export default function Page() {
  return (
    <AppShell>
      <main className="p-6">
        <h1 className="text-3xl font-semibold">Welcome to Spendly</h1>
        <p className="mt-2 text-neutral-600 max-w-2xl">A calm, premium foundation for Spendly's UI. This area will host the future dashboard and product flows.</p>
      </main>
    </AppShell>
  )
}
