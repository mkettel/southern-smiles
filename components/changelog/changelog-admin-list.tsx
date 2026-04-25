"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Plus, Lock, Globe, Upload } from "lucide-react";
import { ChangelogEditor } from "./changelog-editor";
import { ChangelogContent } from "./changelog-content";
import { ChangelogMedia } from "./changelog-media";
import { CHANGELOG_TAGS, TagChip } from "./tags";
import {
  createChangelogEntry,
  deleteChangelogEntry,
  updateChangelogEntry,
  uploadChangelogMedia,
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
  video_url: string | null;
  tags: string[];
  visibility: "admin" | "everyone";
};

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  body: { type: "doc", content: [{ type: "paragraph" }] },
  image_url: null,
  video_url: null,
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
      video_url: entry.video_url,
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

  async function uploadHeaderFile(file: File) {
    if (!form) return;
    setError(null);
    const fd = new FormData();
    fd.append("media", file);
    const res = await uploadChangelogMedia(fd);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setForm({
      ...form,
      image_url: res.type === "image" ? res.url : null,
      video_url: res.type === "video" ? res.url : null,
    });
  }

  async function handleHeaderMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadHeaderFile(file);
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
        video_url: form.video_url,
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
              onHeaderMedia={handleHeaderMedia}
              onDropFile={uploadHeaderFile}
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
                  onHeaderMedia={handleHeaderMedia}
                  onDropFile={uploadHeaderFile}
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
                  <ChangelogMedia
                    imageUrl={entry.image_url}
                    videoUrl={entry.video_url}
                    className="mt-2"
                  />
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
  onHeaderMedia: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDropFile: (file: File) => void | Promise<void>;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

function FormCard({
  form,
  error,
  pending,
  onChange,
  onTagToggle,
  onHeaderMedia,
  onDropFile,
  onCancel,
  onSubmit,
}: FormCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only un-highlight when actually leaving the form (not entering a child).
    if (e.currentTarget === e.target) setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void onDropFile(file);
  }

  return (
    <form
      onSubmit={onSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative space-y-3 rounded-lg border bg-card p-4 ring-2 ring-primary/20 transition-colors",
        isDragging && "border-primary bg-primary/5",
      )}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-background/80">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Upload className="h-4 w-4" />
            Drop image or video to set as header
          </div>
        </div>
      )}
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
          Header media (optional) — image or video
        </label>
        {form.video_url ? (
          <div className="relative inline-block">
            <video
              src={form.video_url}
              autoPlay
              loop
              muted
              playsInline
              className="max-h-40 rounded-md border"
            />
            <button
              type="button"
              onClick={() => onChange({ ...form, video_url: null })}
              className="absolute right-1 top-1 rounded bg-background/90 px-2 py-0.5 text-[10px] hover:bg-background"
            >
              Remove
            </button>
          </div>
        ) : form.image_url ? (
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
          <label className="block cursor-pointer">
            <input
              type="file"
              accept="image/*,video/*"
              onChange={onHeaderMedia}
              className="sr-only"
            />
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-foreground">
              <Upload className="h-5 w-5" />
              <div className="font-medium">Click to upload or drag and drop</div>
              <div className="text-[10px] text-muted-foreground/80">
                Images up to 5MB · Videos up to 25MB
              </div>
            </div>
          </label>
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
