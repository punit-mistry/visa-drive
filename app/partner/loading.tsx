import { VisaLoader } from "@/components/shared/visa-loader";

/**
 * Shown while a partner route resolves. Not `fullscreen`: this renders inside
 * the shell's `<main>`, with the header and nav rail already on screen.
 */
export default function PartnerLoading() {
  return (
    <VisaLoader
      label="Opening your bookings"
      hint="Fetching the latest status for your customers."
      className="min-h-[50vh]"
    />
  );
}
