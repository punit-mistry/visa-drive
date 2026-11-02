"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Loader2, User } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/shared/page-header";
import { DetailSkeleton } from "@/components/shared/states";
import { formatDate } from "@/lib/helpers/format";
import { ROLE_LABELS, type UserRole } from "@/lib/constants/roles";

type CurrentUser = NonNullable<FunctionReturnType<typeof api.users.current>>;

export default function ProfilePage() {
  const user = useQuery(api.users.current);

  if (user === undefined) return <DetailSkeleton />;
  if (user === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account is still being set up. Refresh in a moment.
      </p>
    );
  }

  return <ProfileForm key={user._id} user={user} />;
}

function ProfileForm({ user }: { user: CurrentUser }) {
  const updateProfile = useMutation(api.users.updateProfile);

  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [marketingOptIn, setMarketingOptIn] = useState(user.marketingOptIn ?? false);
  const [whatsappOptIn, setWhatsappOptIn] = useState(user.whatsappOptIn ?? false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        marketingOptIn,
        whatsappOptIn,
      });
      toast.success("Profile updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Your contact details and communication preferences."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Your details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                  minLength={2}
                  autoComplete="name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user.email} readOnly disabled />
                <p className="text-xs text-muted-foreground">
                  Email is managed by your sign-in account.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="marketingOptIn"
                    checked={marketingOptIn}
                    onCheckedChange={(value) => setMarketingOptIn(value === true)}
                  />
                  <div>
                    <Label htmlFor="marketingOptIn">Email updates</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive travel and visa updates by email.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="whatsappOptIn"
                    checked={whatsappOptIn}
                    onCheckedChange={(value) => setWhatsappOptIn(value === true)}
                  />
                  <div>
                    <Label htmlFor="whatsappOptIn">WhatsApp updates</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive application updates on WhatsApp.
                    </p>
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-4" aria-hidden />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Role</span>
              <span>{ROLE_LABELS[user.role as UserRole] ?? user.role}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="capitalize">{user.status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Applications</span>
              <span className="tabular-nums">{user.applicationCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Member since</span>
              <span>{formatDate(user.createdAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
