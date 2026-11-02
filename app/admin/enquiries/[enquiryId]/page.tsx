"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  Mail,
  MessageCircle,
  Save,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { LeadStatusBadge } from "@/components/shared/status-badge";
import { DetailSkeleton, ErrorState } from "@/components/shared/states";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  formatDate,
  formatDateTime,
  formatPhone,
  titleCase,
} from "@/lib/helpers/format";
import { PERMISSIONS } from "@/lib/constants/roles";
import {
  LEAD_STATUSES,
  LEAD_STATUS_CONFIG,
  type LeadStatusValue,
} from "@/lib/constants/statuses";

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function toDateInput(ms?: number | null): string {
  if (!ms) return "";
  const date = new Date(ms);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function fromDateInput(value: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(`${value}T09:00:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

type EnquiryDetail = NonNullable<FunctionReturnType<typeof api.enquiries.getForAdmin>>;

export default function AdminEnquiryDetailPage() {
  const enquiryId = param(useParams().enquiryId) as Id<"enquiries">;
  const enquiry = useQuery(api.enquiries.getForAdmin, { enquiryId });
  const { isLoading: userLoading } = useCurrentUser();

  if (enquiry === undefined || userLoading) return <DetailSkeleton />;
  if (enquiry === null) {
    return (
      <ErrorState
        title="Enquiry not found"
        description="This lead does not exist or you do not have access to it."
      />
    );
  }

  return <EnquiryDetailView key={enquiry._id} enquiryId={enquiryId} enquiry={enquiry} />;
}

function EnquiryDetailView({
  enquiryId,
  enquiry,
}: {
  enquiryId: Id<"enquiries">;
  enquiry: EnquiryDetail;
}) {
  const updateLeadStatus = useMutation(api.enquiries.updateLeadStatus);
  const assign = useMutation(api.enquiries.assign);
  const setFollowUp = useMutation(api.enquiries.setFollowUp);

  const { can } = useCurrentUser();
  const canManage = can(PERMISSIONS.ENQUIRY_MANAGE);
  const canAssign = can(PERMISSIONS.ENQUIRY_ASSIGN);
  const canViewStaff = can(PERMISSIONS.STAFF_VIEW);
  const staff = useQuery(api.users.listStaff, canViewStaff ? {} : "skip");

  const [leadStatus, setLeadStatus] = useState<LeadStatusValue | "">("");
  const [lostReason, setLostReason] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const [assignee, setAssignee] = useState("");
  const [savingAssignee, setSavingAssignee] = useState(false);

  const [followUpInput, setFollowUpInput] = useState(toDateInput(enquiry.followUpAt));
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  async function saveStatus() {
    if (!leadStatus) {
      toast.error("Choose a lead status first.");
      return;
    }
    if (leadStatus === "lost" && !lostReason.trim()) {
      toast.error("Please record why this lead was lost.");
      return;
    }
    setSavingStatus(true);
    try {
      await updateLeadStatus({
        enquiryId,
        leadStatus,
        lostReason: leadStatus === "lost" ? lostReason.trim() : undefined,
      });
      toast.success(`Lead moved to ${LEAD_STATUS_CONFIG[leadStatus].label}.`);
      setLostReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the lead.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveAssignee() {
    setSavingAssignee(true);
    try {
      await assign({
        enquiryId,
        assignedTo: assignee ? (assignee as Id<"users">) : null,
      });
      toast.success(assignee ? "Enquiry assigned." : "Enquiry returned to the shared queue.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign this enquiry.");
    } finally {
      setSavingAssignee(false);
    }
  }

  async function saveFollowUp() {
    setSavingFollowUp(true);
    try {
      await setFollowUp({ enquiryId, followUpAt: fromDateInput(followUpInput) });
      toast.success(followUpInput ? "Follow-up reminder saved." : "Follow-up reminder cleared.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the follow-up.");
    } finally {
      setSavingFollowUp(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={enquiry.fullName}
        description={`${enquiry.referenceId} · ${enquiry.subject}`}
        breadcrumbs={[
          { label: "Enquiries", href: "/admin/enquiries" },
          { label: enquiry.referenceId },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/enquiries">
              <ArrowLeft className="size-4" aria-hidden />
              All enquiries
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <LeadStatusBadge status={enquiry.leadStatus as LeadStatusValue} />
        <span className="text-xs text-muted-foreground">
          Received {formatDateTime(enquiry.createdAt)} · from{" "}
          {titleCase(enquiry.source)}
        </span>
        {enquiry.followUpAt && (
          <span className="rounded-full border border-warning/25 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
            Follow-up {formatDate(enquiry.followUpAt)}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" value={enquiry.fullName} />
                <Field label="Email" value={enquiry.email} />
                <Field label="Phone" value={formatPhone(enquiry.phone)} />
                <Field
                  label="Destination"
                  value={enquiry.destinationName ?? enquiry.interestedCountry ?? "Not specified"}
                />
                <Field
                  label="Visa category"
                  value={
                    enquiry.visaCategory
                      ? titleCase(enquiry.visaCategory)
                      : "Not specified"
                  }
                />
                <Field
                  label="Travel date"
                  value={enquiry.travelDate ? formatDate(enquiry.travelDate) : "Not specified"}
                />
                <Field
                  label="Assignee"
                  value={enquiry.assigneeName ?? "Unassigned"}
                />
                <Field
                  label="Contact attempts"
                  value={`${enquiry.contactAttempts}${
                    enquiry.lastContactedAt
                      ? ` · last ${formatDate(enquiry.lastContactedAt)}`
                      : ""
                  }`}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={`mailto:${enquiry.email}`}>
                    <Mail className="size-3.5" aria-hidden />
                    Email
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`https://wa.me/${enquiry.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="size-3.5" aria-hidden />
                    WhatsApp
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-medium">{enquiry.subject}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {enquiry.message}
              </p>
              {enquiry.lostReason && (
                <div className="rounded-lg border border-border bg-surface p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Lost reason
                  </p>
                  <p className="mt-1">{enquiry.lostReason}</p>
                </div>
              )}
              {enquiry.convertedApplicationId && (
                <>
                  <Separator />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      Converted to application
                      {enquiry.convertedAt ? ` on ${formatDate(enquiry.convertedAt)}` : ""}
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/admin/applications/${enquiry.convertedApplicationId}`}
                      >
                        Open application
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Lead status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="leadStatus">Move to</Label>
                  <select
                    id="leadStatus"
                    value={leadStatus}
                    onChange={(event) =>
                      setLeadStatus(event.target.value as LeadStatusValue | "")
                    }
                    className={selectClass}
                  >
                    <option value="">Choose a status</option>
                    {LEAD_STATUSES.filter(
                      (value) => value !== "converted" || enquiry.convertedUserId,
                    ).map((value) => (
                      <option key={value} value={value}>
                        {LEAD_STATUS_CONFIG[value].label}
                      </option>
                    ))}
                  </select>
                </div>

                {leadStatus === "lost" && (
                  <div className="space-y-2">
                    <Label htmlFor="lostReason">Why was it lost?</Label>
                    <Textarea
                      id="lostReason"
                      rows={3}
                      value={lostReason}
                      onChange={(event) => setLostReason(event.target.value)}
                      placeholder="Budget, timing, chose another provider…"
                    />
                  </div>
                )}

                <Button
                  onClick={saveStatus}
                  disabled={savingStatus || !leadStatus}
                  className="w-full"
                >
                  {savingStatus ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="size-4" aria-hidden />
                  )}
                  Save status
                </Button>
              </CardContent>
            </Card>
          )}

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="size-4" aria-hidden />
                  Follow-up
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label htmlFor="followUp">Remind us on</Label>
                <Input
                  id="followUp"
                  type="date"
                  value={followUpInput}
                  onChange={(event) => setFollowUpInput(event.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={saveFollowUp}
                    disabled={savingFollowUp}
                    className="flex-1"
                    variant="outline"
                  >
                    {savingFollowUp ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Save className="size-4" aria-hidden />
                    )}
                    Save
                  </Button>
                  {enquiry.followUpAt && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setFollowUpInput("");
                        void setFollowUp({ enquiryId, followUpAt: null })
                          .then(() => toast.success("Follow-up reminder cleared."))
                          .catch((error: unknown) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Could not clear the follow-up.",
                            ),
                          );
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {canAssign && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCog className="size-4" aria-hidden />
                  Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label htmlFor="assignee">Assigned to</Label>
                <select
                  id="assignee"
                  value={assignee || (enquiry.assignedTo ?? "")}
                  onChange={(event) => setAssignee(event.target.value)}
                  className={selectClass}
                >
                  <option value="">Shared queue</option>
                  {(staff ?? []).map((member) => (
                    <option key={member._id} value={member._id}>
                      {member.fullName} · {member.role.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={saveAssignee}
                  disabled={savingAssignee}
                  variant="outline"
                  className="w-full"
                >
                  {savingAssignee ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="size-4" aria-hidden />
                  )}
                  Save assignment
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}
