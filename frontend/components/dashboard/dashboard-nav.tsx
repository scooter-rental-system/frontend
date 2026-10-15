"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/profile", label: "Profile" },
] as const;

export function DashboardNav() {
  const pathname = usePathname();
  const { session, signOut } = useAuth();

  return (
    <header className="border-b border-black/[.08] bg-white dark:border-white/[.12] dark:bg-black">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight">
          Scooter Rental
        </Link>
        {session.status === "signed-in" && (
          <button
            type="button"
            onClick={signOut}
            className="text-sm text-zinc-600 hover:text-foreground sm:order-last dark:text-zinc-400"
          >
            Sign out
          </button>
        )}
        <nav aria-label="Dashboard" className="-mx-1 flex w-full gap-1 overflow-x-auto sm:w-auto sm:flex-1">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-foreground text-background"
                    : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
