"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Maximize, Minimize, Minus, Plus, Scan } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanContainerProps {
  children: ReactNode;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
  fitOnMount?: boolean;
}

const ZOOM_STEP = 0.1;
const WHEEL_ZOOM_SENSITIVITY = 0.002;
const MAX_WHEEL_ZOOM_STEP = 0.025;
const DEFAULT_MIN = 0.4;
const DEFAULT_MAX = 2;

/**
 * Pan + zoom container. Click-and-drag background to pan and Ctrl/Cmd + wheel
 * to zoom. Unmodified wheel gestures keep native two-axis scrolling. Content
 * is scaled via CSS `zoom` so scrollbars adjust automatically and interactive
 * descendants keep their correct hit targets.
 *
 * Drag only initiates on elements tagged `data-pan-handle`.
 */
export function PanContainer({
  children,
  className,
  minZoom = DEFAULT_MIN,
  maxZoom = DEFAULT_MAX,
  fitOnMount = false,
}: PanContainerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hasFittedRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dragState = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    pointerId: number;
  } | null>(null);

  const clampZoom = useCallback(
    (value: number) => Math.min(maxZoom, Math.max(minZoom, value)),
    [minZoom, maxZoom]
  );

  const zoomBy = useCallback(
    (delta: number, origin?: { x: number; y: number }) => {
      const viewport = viewportRef.current;
      setZoom((current) => {
        const next = clampZoom(current + delta);
        if (!viewport || next === current) return next;

        const x = origin?.x ?? viewport.clientWidth / 2;
        const y = origin?.y ?? viewport.clientHeight / 2;
        const startLeft = viewport.scrollLeft;
        const startTop = viewport.scrollTop;
        const ratio = next / current;

        requestAnimationFrame(() => {
          viewport.scrollLeft = (startLeft + x) * ratio - x;
          viewport.scrollTop = (startTop + y) * ratio - y;
        });

        return next;
      });
    },
    [clampZoom]
  );

  const fitToViewport = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const child = content?.firstElementChild as HTMLElement | null;
    if (!viewport || !child) return;

    const rect = child.getBoundingClientRect();
    const naturalWidth = rect.width / zoom;
    const naturalHeight = rect.height / zoom;
    if (naturalWidth <= 0 || naturalHeight <= 0) return;

    const next = clampZoom(
      Math.min(
        1,
        (viewport.clientWidth - 16) / naturalWidth,
        (viewport.clientHeight - 16) / naturalHeight
      )
    );

    setZoom(next);
    requestAnimationFrame(() => {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
  }, [clampZoom, zoom]);

  useEffect(() => {
    if (!fitOnMount || hasFittedRef.current) return;
    hasFittedRef.current = true;

    let frame = 0;
    const timeout = window.setTimeout(() => {
      frame = requestAnimationFrame(fitToViewport);
    }, 360);

    return () => {
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [fitOnMount, fitToViewport]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-pan-handle]")) return;
      if (
        target.closest(
          "button, a, input, select, textarea, [role='button'], [data-no-pan]"
        )
      ) {
        return;
      }
      const viewport = viewportRef.current;
      if (!viewport) return;

      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        pointerId: e.pointerId,
      };
      viewport.setPointerCapture(e.pointerId);
      setIsDragging(true);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragState.current;
      const viewport = viewportRef.current;
      if (!state || !viewport) return;
      if (e.pointerId !== state.pointerId) return;
      viewport.scrollLeft = state.scrollLeft - (e.clientX - state.startX);
      viewport.scrollTop = state.scrollTop - (e.clientY - state.startY);
    },
    []
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state || e.pointerId !== state.pointerId) return;
    viewportRef.current?.releasePointerCapture(e.pointerId);
    dragState.current = null;
    setIsDragging(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (document.fullscreenElement === root) {
        await document.exitFullscreen();
      } else {
        await root.requestFullscreen();
      }
    } catch {
      // Fullscreen can reject (e.g. iframe without allow=fullscreen) — fail quietly.
    }
  }, []);

  useEffect(() => {
    function onChange() {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Intercept only zoom gestures; native scrolling preserves the trackpad axis.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const listener = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const delta = Math.max(
          -MAX_WHEEL_ZOOM_STEP,
          Math.min(MAX_WHEEL_ZOOM_STEP, -e.deltaY * WHEEL_ZOOM_SENSITIVITY)
        );
        zoomBy(delta, {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        return;
      }
    };
    viewport.addEventListener("wheel", listener, { passive: false });
    return () => viewport.removeEventListener("wheel", listener);
  }, [zoomBy]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative bg-background",
        isFullscreen ? "!h-screen !w-screen !min-h-0 !rounded-none !border-0" : className
      )}
    >
      <div
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          "w-full h-full overflow-auto overscroll-contain select-none",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
      >
        {/* `zoom` scales layout, so scrollbar extents stay correct. */}
        <div ref={contentRef} style={{ zoom }}>{children}</div>
      </div>

      {/* Zoom / fullscreen controls — bottom-left so they don't collide with the chat widget */}
      <div
        data-no-pan
        className="absolute bottom-3 left-3 flex items-center gap-1 rounded-md border bg-background/95 backdrop-blur px-1 py-0.5 shadow-sm"
      >
        <button
          onClick={() => zoomBy(-ZOOM_STEP)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setZoom(1)}
          className="px-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground tabular-nums min-w-[2.5rem]"
          aria-label="Reset zoom"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => zoomBy(ZOOM_STEP)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button
          onClick={fitToViewport}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Fit board to view"
          title="Fit board to view"
        >
          <Scan className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button
          onClick={toggleFullscreen}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <Minimize className="h-3.5 w-3.5" />
          ) : (
            <Maximize className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
