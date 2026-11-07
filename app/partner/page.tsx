import { redirect } from "next/navigation";

/** `/partner` is not a page of its own — the dashboard is the front door. */
export default function PartnerIndexPage() {
  redirect("/partner/dashboard");
}
