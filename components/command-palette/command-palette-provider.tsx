"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { logout } from "@/actions/auth";
import { getAssignableMembers } from "@/actions/tasks";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import type { Profile } from "@/lib/types";
import { CommandPalette } from "./command-palette";
import { buildCommands, type CommandActionId } from "./commands";

interface CommandPaletteContextValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  }
  return ctx;
}

interface CommandPaletteProviderProps {
  profile: Profile;
  children: ReactNode;
}

export function CommandPaletteProvider({ profile, children }: CommandPaletteProviderProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isAdmin = profile.role === "admin";

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  // Members are needed for the create-task dialog. Fetch lazily on first use
  // so we don't pay for it on every page load.
  const [members, setMembers] = useState<Profile[] | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const ensureMembers = useCallback(async () => {
    if (members || loadingMembers) return;
    setLoadingMembers(true);
    try {
      const data = await getAssignableMembers();
      setMembers(data);
    } finally {
      setLoadingMembers(false);
    }
  }, [members, loadingMembers]);

  const commands = useMemo(() => buildCommands({ role: profile.role }), [profile.role]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const togglePalette = useCallback(() => setPaletteOpen((o) => !o), []);

  // Global ⌘K / Ctrl+K listener.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePalette]);

  const handleAction = useCallback(
    async (action: CommandActionId) => {
      switch (action) {
        case "create-task": {
          if (!isAdmin) return;
          // Fire and forget — opens the dialog immediately; the picker will
          // render once members arrive. The dialog already handles an empty
          // members list gracefully.
          ensureMembers();
          setTaskDialogOpen(true);
          break;
        }
        case "new-oic-entry": {
          router.push("/oic-log");
          break;
        }
        case "toggle-theme": {
          setTheme(theme === "dark" ? "light" : "dark");
          break;
        }
        case "sign-out": {
          await logout();
          router.refresh();
          break;
        }
      }
    },
    [isAdmin, ensureMembers, router, setTheme, theme],
  );

  const ctxValue = useMemo<CommandPaletteContextValue>(
    () => ({
      open: openPalette,
      close: closePalette,
      toggle: togglePalette,
      isOpen: paletteOpen,
    }),
    [openPalette, closePalette, togglePalette, paletteOpen],
  );

  return (
    <CommandPaletteContext.Provider value={ctxValue}>
      {children}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={commands}
        onAction={handleAction}
      />
      {isAdmin && (
        <CreateTaskDialog
          open={taskDialogOpen}
          onOpenChange={setTaskDialogOpen}
          members={members ?? []}
          viewerId={profile.id}
        />
      )}
    </CommandPaletteContext.Provider>
  );
}
