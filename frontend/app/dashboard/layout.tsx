import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";
import { CustomerGate } from "@/components/dashboard/customer-gate";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";

export const metadata: Metadata = {
  title: "My dashboard · Scooter Rental",
  description: "Your rentals, booking history and profile.",
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <AuthProvider>
      <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
        <DashboardNav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
          <CustomerGate>{children}</CustomerGate>
        </main>
      </div>
    </AuthProvider>
  );
}
