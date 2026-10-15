"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import type { User } from "@/lib/types";
import { Card, ErrorState, Skeleton } from "./ui";

/** Login page from FE-002 (Authentication UI). */
export const LOGIN_PATH = "/login";

const CustomerContext = createContext<User | null>(null);

/** The signed-in customer. Only usable below <CustomerGate>. */
export function useCustomer(): User {
  const user = useContext(CustomerContext);
  if (!user) throw new Error("useCustomer must be used inside CustomerGate");
  return user;
}

/**
 * Renders the dashboard only for a signed-in customer (role USER).
 * This is a UX guard; the backend must still authenticate and scope every request.
 */
export function CustomerGate({ children }: { children: ReactNode }) {
  const { session, refresh } = useAuth();

  if (session.status === "loading") return <Skeleton rows={3} label="Checking your session" />;

  if (session.status === "error") {
    return <ErrorState message={`We couldn't load your account. ${session.error.message}`} onRetry={refresh} />;
  }

  if (session.status === "signed-out") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-semibold">Sign in to view your dashboard</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Your bookings and profile are only shown to you once you&apos;re signed in.
        </p>
        <Link
          href={LOGIN_PATH}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background hover:opacity-90"
        >
          Sign in
        </Link>
      </Card>
    );
  }

  if (session.user.role !== "USER") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-semibold">Customer accounts only</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This dashboard shows a customer&apos;s own rentals. Staff accounts use the admin console.
        </p>
      </Card>
    );
  }

  return <CustomerContext.Provider value={session.user}>{children}</CustomerContext.Provider>;
}
