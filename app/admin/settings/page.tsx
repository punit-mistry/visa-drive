"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertCircle, RotateCcw, Save, Settings } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { DetailSkeleton } from "@/components/shared/states";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useValidation, type FieldErrors } from "@/hooks/use-validation";
import { FieldError } from "@/components/shared/form-field";
import { PERMISSIONS } from "@/lib/constants/roles";
import { titleCase } from "@/lib/helpers/format";
import { friendlyError } from "@/lib/helpers/error-messages";

type SettingRow = {
  key: string;
  category: string;
  label: string;
  description: string | null;
  value: unknown;
  defaultValue: unknown;
  isPublic: boolean;
  isDefault: boolean;
  updatedAt: number | null;
  updatedBy: string | null;
};

type DraftValue = string | number | boolean;

function isJsonKind(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

function toDraft(value: unknown): DraftValue {
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function fromDraft(value: unknown, draft: DraftValue): unknown {
  if (typeof value === "boolean") return draft;
  // Numbers are held as the raw text while editing and parsed only on save.
  if (typeof value === "number") return typeof draft === "string" ? Number(draft) : draft;
  if (typeof value === "string" && !isJsonKind(value)) return draft;
  if (value === null) return JSON.parse(String(draft));
  if (isJsonKind(value)) return JSON.parse(String(draft));
  return draft;
}

function serialize(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

function buildInitialDraft(settings: SettingRow[]): Record<string, DraftValue> {
  return Object.fromEntries(settings.map((setting) => [setting.key, toDraft(setting.value)]));
}

function SettingsEditor({
  settings,
  canEdit,
}: {
  settings: SettingRow[];
  canEdit: boolean;
}) {
  const setMany = useMutation(api.appSettings.setMany);

  const [draft, setDraft] = useState<Record<string, DraftValue>>(() => buildInitialDraft(settings));
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => {
    const byCategory = new Map<string, SettingRow[]>();
    for (const setting of settings) {
      const rows = byCategory.get(setting.category) ?? [];
      rows.push(setting);
      byCategory.set(setting.category, rows);
    }
    return Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [settings]);

  const changed = useMemo(() => {
    return settings
      .filter((setting) => {
        const current = draft[setting.key];
        if (current === undefined) return false;
        try {
          return serialize(fromDraft(setting.value, current)) !== serialize(setting.value);
        } catch {
          return true;
        }
      })
      .map((setting) => setting.key);
  }, [settings, draft]);

  // Only what is about to be saved is checked: a number that is not a number,
  // JSON that does not parse. Keys are the control ids, in page order.
  const { errors, check } = useValidation((): FieldErrors => {
    const found: FieldErrors = {};
    for (const [, rows] of groups) {
      for (const setting of rows) {
        if (!changed.includes(setting.key)) continue;
        const current = draft[setting.key];
        if (
          typeof setting.value === "number" &&
          (String(current).trim() === "" || !Number.isFinite(Number(current)))
        ) {
          found[`setting-${setting.key}`] = "Enter a valid number.";
        } else if (isJsonKind(setting.value) || setting.value === null) {
          try {
            JSON.parse(String(current));
          } catch {
            found[`setting-${setting.key}`] = "Enter valid JSON.";
          }
        }
      }
    }
    return found;
  });

  async function save() {
    if (changed.length === 0) return;
    if (!check()) return;
    setSaving(true);

    try {
      const updates = changed.map((key) => {
        const setting = settings.find((row) => row.key === key)!;
        const next = fromDraft(setting.value, draft[key]);
        return { key, value: next };
      });

      const result = await setMany({ settings: updates });
      toast.success(
        result.updated === 0
          ? "Nothing to save — those values already match."
          : `Saved ${result.updated} setting${result.updated === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not save settings. Check that object values are valid JSON."),
      );
    } finally {
      setSaving(false);
    }
  }

  function resetToDefault(setting: SettingRow) {
    setDraft((current) => ({
      ...current,
      [setting.key]: toDraft(setting.defaultValue),
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Company details, booking rules and integration configuration. Changes are audited."
        actions={
          canEdit ? (
            <Button onClick={save} disabled={saving || changed.length === 0}>
              <Save className="size-4" aria-hidden />
              {saving ? "Saving..." : `Save${changed.length ? ` (${changed.length})` : ""}`}
            </Button>
          ) : undefined
        }
      />

      {!canEdit && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          You can review settings but not change them. An administrator can grant
          you settings edit access.
        </div>
      )}

      <div className="space-y-6">
          {groups.map(([category, rows]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="size-4 text-muted-foreground" aria-hidden />
                  {titleCase(category)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {rows.map((setting) => {
                  const value = draft[setting.key];
                  const kind = isJsonKind(setting.value)
                    ? "json"
                    : typeof setting.value === "boolean"
                      ? "boolean"
                      : typeof setting.value === "number"
                        ? "number"
                        : setting.value === null
                          ? "json"
                          : "string";

                  return (
                    <div key={setting.key} className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={`setting-${setting.key}`}>
                          {setting.label}
                          {setting.isPublic && (
                            <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                              Public
                            </span>
                          )}
                          {setting.isDefault && (
                            <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                              Using default
                            </span>
                          )}
                        </Label>

                        {canEdit && !setting.isDefault && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => resetToDefault(setting)}
                          >
                            <RotateCcw className="size-3" aria-hidden />
                            Reset to default
                          </Button>
                        )}
                      </div>

                      {kind === "boolean" ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`setting-${setting.key}`}
                            checked={!!value}
                            disabled={!canEdit}
                            onCheckedChange={(checked) =>
                              setDraft((current) => ({
                                ...current,
                                [setting.key]: checked,
                              }))
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            {value ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      ) : kind === "json" ? (
                        <Textarea
                          id={`setting-${setting.key}`}
                          value={String(value ?? "")}
                          disabled={!canEdit}
                          aria-invalid={errors[`setting-${setting.key}`] ? true : undefined}
                          aria-describedby={
                            errors[`setting-${setting.key}`]
                              ? `setting-${setting.key}-error`
                              : undefined
                          }
                          rows={4}
                          spellCheck={false}
                          className="font-mono text-xs"
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [setting.key]: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <Input
                          id={`setting-${setting.key}`}
                          type={kind === "number" ? "number" : "text"}
                          value={String(value ?? "")}
                          disabled={!canEdit}
                          aria-invalid={errors[`setting-${setting.key}`] ? true : undefined}
                          aria-describedby={
                            errors[`setting-${setting.key}`]
                              ? `setting-${setting.key}-error`
                              : undefined
                          }
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [setting.key]: event.target.value,
                            }))
                          }
                        />
                      )}

                      <FieldError
                        id={`setting-${setting.key}`}
                        message={errors[`setting-${setting.key}`]}
                      />

                      {setting.description && (
                        <p className="text-xs text-muted-foreground">
                          {setting.description}
                        </p>
                      )}
                      <p className="font-mono text-[11px] text-muted-foreground/70">
                        {setting.key}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}

          {canEdit && changed.length > 0 && (
            <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-3 elev-sm">
              <p className="text-sm text-muted-foreground">
                {changed.length} unsaved change{changed.length === 1 ? "" : "s"}
              </p>
              <Button onClick={save} disabled={saving}>
                <Save className="size-4" aria-hidden />
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

export default function AdminSettingsPage() {
  const { can } = useCurrentUser();
  const canView = can(PERMISSIONS.SETTINGS_VIEW);
  const canEdit = can(PERMISSIONS.SETTINGS_EDIT);

  const settings = useQuery(api.appSettings.getAll, canView ? {} : "skip") as
    | SettingRow[]
    | undefined;

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="VisaDrive configuration." />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            You do not have permission to view application settings.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (settings === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="VisaDrive configuration." />
        <DetailSkeleton />
      </div>
    );
  }

  return <SettingsEditor settings={settings} canEdit={canEdit} />;
}
