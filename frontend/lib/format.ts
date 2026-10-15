const lkr = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 2 });

export const money = (n: number | null | undefined) => (n == null ? "—" : lkr.format(n));

export const date = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const dateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
