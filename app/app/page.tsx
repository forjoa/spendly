import Link from "next/link"
import { Plug, KeyRound, Smartphone, ArrowRight } from "lucide-react"
import { PageHeader } from "@/components/app-shell/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { ArrowLeftRight } from "lucide-react"

const steps = [
  {
    icon: Plug,
    title: "Connect a destination",
    description:
      "Link the Notion database where your transactions should appear.",
    href: "/app/connections",
  },
  {
    icon: KeyRound,
    title: "Create an API key",
    description:
      "Generate a secret key that authorizes your iOS Shortcut to send payments.",
    href: "/app/keys",
  },
  {
    icon: Smartphone,
    title: "Add the iOS Shortcut",
    description:
      "Trigger it from Apple Wallet so every payment is captured automatically.",
    href: "/app/keys",
  },
]

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Welcome to Spendly"
        description="Your expenses happen automatically. Once set up, every payment becomes a clean, structured transaction delivered where you already work."
      />

      <section aria-labelledby="setup-heading" className="flex flex-col gap-4">
        <h2
          id="setup-heading"
          className="text-sm font-medium text-muted-foreground"
        >
          How Spendly works
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <Card key={step.title} className="gap-4">
                <CardHeader>
                  <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </div>
                  <CardTitle className="flex items-center gap-2 pt-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {step.title}
                  </CardTitle>
                  <CardDescription className="leading-relaxed">
                    {step.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-4">
        <h2
          id="recent-heading"
          className="text-sm font-medium text-muted-foreground"
        >
          Recent transactions
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ArrowLeftRight />
                </EmptyMedia>
                <EmptyTitle>No transactions yet</EmptyTitle>
                <EmptyDescription>
                  Once Spendly is connected, every payment you make will show up
                  here automatically — no manual entry.
                </EmptyDescription>
              </EmptyHeader>
              <Button asChild>
                <Link href="/app/connections">
                  Connect a destination
                  <ArrowRight />
                </Link>
              </Button>
            </Empty>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
