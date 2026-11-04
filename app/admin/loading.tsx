import { VisaLoader } from "@/components/shared/visa-loader";

/** Shown inside the CRM shell while a route resolves. Sized to the content
 *  area, not the viewport — the sidebar and header stay put around it. */
export default function AdminLoading() {
  return (
    <VisaLoader
      label="Opening the workspace"
      hint="Loading applications, documents and today's queue."
      className="min-h-[50vh]"
    />
  );
}
