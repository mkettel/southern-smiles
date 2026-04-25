"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Plus, Lock, Globe } from "lucide-react";
import { ChangelogEditor } from "./changelog-editor";
import { ChangelogContent } from "./changelog-content";
import { CHANGELOG_TAGS, TagChip } from "./tags";
import {
  createChangelogEntry,
  deleteChangelogEntry,
  updateChangelogEntry,
  uploadChangelogImage,
} from "@/actions/changelog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ChangelogEntry } from "@/lib/types";

interface ChangelogAdminListProps {
  entries: ChangelogEntry[];
}

type FormState = {
  id: string | null;
  title: string;
  body: unknown;
  image_url: string | null;
  tags: string[];
  visibility: "admin" | "everyone";
};

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  body: { type: "doc", content: [{ type: "paragraph" }] },
  image_url: null,
  tags: [],
  visibility: "admin",
};

const TAG_DOT_COLORS: Record<string, string> = {
  feature: "bg-emerald-500",
  fix: "bg-amber-500",
  headsup: "bg-sky-500",
  note: "bg-muted-foreground/50",
};

function dotColorForEntry(entry: ChangelogEntry): string {
  const first = entry.tags[0];
  return TAG_DOT_COLORS[first ?? ""] ?? "bg-muted-foreground/50";
}

export function ChangelogAdminList({ entries }: ChangelogAdminListProps) {
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openNew() {
    setError(null);
    setForm(EMPTY_FORM);
  }

  function openEdit(entry: ChangelogEntry) {
    setError(null);
    setForm({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      image_url: entry.image_url,
      tags: entry.tags,
      visibility: entry.visibility,
    });
  }

  function close() {
    setForm(null);
    setError(null);
  }

  function toggleTag(id: string) {
    if (!form) return;
    setForm({
      ...form,
      tags: form.tags.includes(id)
        ? form.tags.filter((t) => t !== id)
        : [...form.tags, id],
    });
  }

  async function handleHeaderImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    const fd = new FormData();
    fd.append("image", file);
    const res = await uploadChangelogImage(fd);
    if (res.error || !res.url) {
      setError(res.error ?? "Upload failed");
      return;
    }
    setForm({ ...form, image_url: res.url });
    e.target.value = "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);

    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }

    startTransition(async () => {
      const payload = {
        title: form.title,
        body: form.body,
        image_url: form.image_url,
        tags: form.tags,
        visibility: form.visibility,
      };
      const res = form.id
        ? await updateChangelogEntry(form.id, payload)
        : await createChangelogEntry(payload);

      if (res.error) {
        setError(typeof res.error === "string" ? res.error : "Save failed");
        return;
      }
      close();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this entry? This can't be undone.")) return;
    startTransition(async () => {
      const res = await deleteChangelogEntry(id);
      if (res.error) {
        setError(res.error);
        return;
      }
    });
  }

  const isCreating = form?.id === null;

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        {entries.length} {entries.length === 1 ? "entry" : "entries"}
      </p>

      <ol className="relative space-y-6 border-l border-border pl-6">
        {/* Create node — always at the top */}
        <li className="relative">
          <span
            className={cn(
              "absolute -left-[31px] top-2 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-background transition-colors",
              isCreating
                ? "bg-primary"
                : "bg-background border-2 border-dashed border-muted-foreground/40",
            )}
          >
            {!isCreating && (
              <Plus className="h-2.5 w-2.5 text-muted-foreground/60" />
            )}
          </span>

          {isCreating ? (
            <FormCard
              form={form!}
              error={error}
              pending={pending}
              onChange={setForm}
              onTagToggle={toggleTag}
              onHeaderImage={handleHeaderImage}
              onCancel={close}
              onSubmit={handleSubmit}
            />
          ) : (
            <button
              type="button"
              onClick={openNew}
              className="group flex w-full items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-card/50 p-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted group-hover:bg-primary/10">
                <Plus className="h-3.5 w-3.5" />
              </span>
              New entry
            </button>
          )}
        </li>

        {entries.map((entry) => {
          const isEditing = form?.id === entry.id;
          return (
            <li key={entry.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[31px] top-3 inline-block h-3 w-3 rounded-full ring-4 ring-background",
                  dotColorForEntry(entry),
                )}
              />
              {isEditing ? (
                <FormCard
                  form={form!}
                  error={error}
                  pending={pending}
                  onChange={setForm}
                  onTagToggle={toggleTag}
                  onHeaderImage={handleHeaderImage}
                  onCancel={close}
                  onSubmit={handleSubmit}
                />
              ) : (
                <article className="rounded-lg border bg-card p-4">
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {entry.tags.map((t) => (
                        <TagChip key={t} tag={t} />
                      ))}
                      {entry.visibility === "everyone" ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Globe className="h-2.5 w-2.5" /> Public
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Lock className="h-2.5 w-2.5" /> Admin
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(entry)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-semibold">{entry.title}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                    {entry.author?.full_name && ` · ${entry.author.full_name}`}
                  </p>
                  {entry.image_url && (
                    <img
                      src={entry.image_url}
                      alt=""
                      className="mt-2 max-h-64 w-full rounded-md border object-cover"
                    />
                  )}
                  <div className="mt-2">
                    <ChangelogContent body={entry.body} />
                  </div>
                </article>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface FormCardProps {
  form: FormState;
  error: string | null;
  pending: boolean;
  onChange: (next: FormState) => void;
  onTagToggle: (id: string) => void;
  onHeaderImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

function FormCard({
  form,
  error,
  pending,
  onChange,
  onTagToggle,
  onHeaderImage,
  onCancel,
  onSubmit,
}: FormCardProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border bg-card p-4 ring-2 ring-primary/20"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {form.id ? "Edit entry" : "New entry"}
        </h2>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <VisibilityButton
            active={form.visibility === "admin"}
            onClick={() => onChange({ ...form, visibility: "admin" })}
            icon={<Lock className="h-3 w-3" />}
            label="Admin only"
          />
          <VisibilityButton
            active={form.visibility === "everyone"}
            onClick={() => onChange({ ...form, visibility: "everyone" })}
            icon={<Globe className="h-3 w-3" />}
            label="Everyone"
          />
        </div>
      </div>

      <Input
        placeholder="Title"
        value={form.title}
        onChange={(e) => onChange({ ...form, title: e.target.value })}
        maxLength={200}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          Tags
        </span>
        {CHANGELOG_TAGS.map((t) => {
          const active = form.tags.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTagToggle(t.id)}
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-opacity",
                t.className,
                !active && "opacity-40 hover:opacity-100",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <ChangelogEditor
        value={form.body}
        onChange={(json) => onChange({ ...form, body: json })}
      />

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Header image (optional)
        </label>
        {form.image_url ? (
          <div className="relative inline-block">
            <img
              src={form.image_url}
              alt=""
              className="max-h-40 rounded-md border"
            />
            <button
              type="button"
              onClick={() => onChange({ ...form, image_url: null })}
              className="absolute right-1 top-1 rounded bg-background/90 px-2 py-0.5 text-[10px] hover:bg-background"
            >
              Remove
            </button>
          </div>
        ) : (
          <input
            type="file"
            accept="image/*"
            onChange={onHeaderImage}
            className="text-xs"
          />
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} size="sm">
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : form.id ? "Save" : "Publish"}
        </Button>
      </div>
    </form>
  );
}

function VisibilityButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
