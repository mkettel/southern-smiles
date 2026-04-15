"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Maximize, Minimize, Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanContainerProps {
  children: ReactNode;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
}

const ZOOM_STEP = 0.1;
const DEFAULT_MIN = 0.4;
const DEFAULT_MAX = 2;

/**
 * Pan + zoom container. Click-and-drag background to pan, Ctrl/Cmd + wheel
 * to zoom, wheel alone → horizontal pan. Content is scaled via CSS `zoom`
 * so scrollbars adjust automatically and interactive descendants keep their
 * correct hit targets.
 *
 * Drag only initiates on elements tagged `data-pan-handle`.
 */
export function PanContainer({
  children,
  className,
  minZoom = DEFAULT_MIN,
  maxZoom = DEFAULT_MAX,
}: PanContainerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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
    (delta: number) => setZoom((z) => clampZoom(z + delta)),
    [clampZoom]
  );

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

  // Wheel: ctrl/cmd → zoom; plain vertical wheel → horizontal pan.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const listener = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => clampZoom(z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
        return;
      }
      if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        viewport.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    viewport.addEventListener("wheel", listener, { passive: false });
    return () => viewport.removeEventListener("wheel", listener);
  }, [clampZoom]);

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
        <div style={{ zoom }}>{children}</div>
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
          onClick={() => setZoom(1)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Reset zoom"
          title="Reset zoom"
        >
          <RotateCcw className="h-3.5 w-3.5" />
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
