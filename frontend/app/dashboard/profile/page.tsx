"use client";

import { useCustomer } from "@/components/dashboard/customer-gate";
import { Card, DetailRow } from "@/components/dashboard/ui";
import { date } from "@/lib/format";

export default function ProfilePage() {
  const user = useCustomer();
  const missing = <span className="text-zinc-500">Not provided</span>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">The details on your account, used for your rental contracts.</p>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Contact</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <DetailRow label="Full name">{user.fullName}</DetailRow>
          <DetailRow label="Email">{user.email}</DetailRow>
          <DetailRow label="Mobile">{user.phone || missing}</DetailRow>
          <DetailRow label="Country">{user.country || missing}</DetailRow>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Identity documents</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <DetailRow label="NIC / Passport no.">{user.idDocumentNumber || missing}</DetailRow>
          <DetailRow label="Driving licence no.">{user.drivingLicenseNo || missing}</DetailRow>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Account</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <DetailRow label="Status">{user.active ? "Active" : "Inactive"}</DetailRow>
          <DetailRow label="Member since">{date(user.createdAt)}</DetailRow>
        </dl>
      </Card>
    </div>
  );
}
