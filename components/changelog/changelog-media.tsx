"use client";

import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChangelogMediaProps {
  imageUrl: string | null;
  videoUrl: string | null;
  className?: string;
}

/**
 * Renders the changelog header media (image or video) with a click-to-zoom
 * lightbox. Renders nothing if neither URL is set. Videos autoplay-loop-muted
 * inline; in the lightbox they get controls so the user can scrub/unmute.
 */
export function ChangelogMedia({ imageUrl, videoUrl, className }: ChangelogMediaProps) {
  const [open, setOpen] = useState(false);

  if (!imageUrl && !videoUrl) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative block w-full overflow-hidden rounded-md border transition-opacity hover:opacity-95",
          className,
        )}
        aria-label="View larger"
      >
        {videoUrl ? (
          <video
            src={videoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="max-h-64 w-full object-cover"
          />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="max-h-64 w-full object-cover"
          />
        ) : null}
        <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center justify-center rounded-md bg-background/80 p-1.5 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
      </button>

      {open && (
        <Lightbox
          imageUrl={imageUrl}
          videoUrl={videoUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function Lightbox({
  imageUrl,
  videoUrl,
  onClose,
}: {
  imageUrl: string | null;
  videoUrl: string | null;
  onClose: () => void;
}) {
  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Stop the inner click from bubbling so clicking the media doesn't close the lightbox. */}
      <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full">
        {videoUrl ? (
          <video
            src={videoUrl}
            autoPlay
            loop
            controls
            playsInline
            className="max-h-[90vh] max-w-[95vw] rounded-lg shadow-2xl"
          />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="max-h-[90vh] max-w-[95vw] rounded-lg shadow-2xl object-contain"
          />
        ) : null}
      </div>
    </div>
  );
}
