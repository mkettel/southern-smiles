"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createDivision,
  updateDivision,
  deleteDivision,
  updatePost,
  deletePost,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  createSection,
  updateSection,
  deleteSection,
  reorderDepartments,
  reorderSections,
} from "@/actions/admin";
import type { Division, Post, Department, Section } from "@/lib/types";

export function useOrgEditing() {
  const [isPending, startTransition] = useTransition();

  // ── Division editing ──────────────────────────────────────
  const [editingDiv, setEditingDiv] = useState<string | null>(null);
  const [editDivName, setEditDivName] = useState("");
  const [editDivNumber, setEditDivNumber] = useState("");
  const [editDivExec, setEditDivExec] = useState("");
  const [editDivVfp, setEditDivVfp] = useState("");
  const [editDivColor, setEditDivColor] = useState("");
  const [addingDiv, setAddingDiv] = useState(false);
  const [newDivName, setNewDivName] = useState("");
  const [newDivNumber, setNewDivNumber] = useState("");

  // ── Department editing ────────────────────────────────────
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState("");
  const [editDeptDirector, setEditDeptDirector] = useState("");
  const [addingDeptToDivId, setAddingDeptToDivId] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptDirector, setNewDeptDirector] = useState("");

  // ── Section editing ───────────────────────────────────────
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState("");
  const [editSectionAssignee, setEditSectionAssignee] = useState("");
  const [editSectionPostId, setEditSectionPostId] = useState<string | null>(null);
  const [addingSectionToDeptId, setAddingSectionToDeptId] = useState<string | null>(null);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionAssignee, setNewSectionAssignee] = useState("");

  // ── Responsibilities editing ──────────────────────────────
  const [editingResponsibilities, setEditingResponsibilities] = useState<string | null>(null);
  const [editResponsibilities, setEditResponsibilities] = useState<string[]>([]);
  const [newResponsibility, setNewResponsibility] = useState("");

  // ── Post editing ──────────────────────────────────────────
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editPostTitle, setEditPostTitle] = useState("");
  const [editPostVfp, setEditPostVfp] = useState("");
  const [editPostDivId, setEditPostDivId] = useState("");

  // ── Linking post to section ───────────────────────────────
  const [linkingPostId, setLinkingPostId] = useState<string | null>(null);

  // ── Division handlers ─────────────────────────────────────

  function startEditDiv(div: Division) {
    setEditingDiv(div.id);
    setEditDivName(div.name);
    setEditDivNumber(String(div.number));
    setEditDivExec(div.executive ?? "");
    setEditDivVfp(div.vfp ?? "");
    setEditDivColor(div.color ?? "#6b7280");
  }

  function handleSaveDiv(id: string) {
    startTransition(async () => {
      const result = await updateDivision(id, {
        name: editDivName.trim(),
        number: parseInt(editDivNumber),
        executive: editDivExec.trim() || null,
        vfp: editDivVfp.trim() || null,
        color: editDivColor || undefined,
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Division updated");
        setEditingDiv(null);
      }
    });
  }

  function handleDeleteDiv(id: string) {
    startTransition(async () => {
      const result = await deleteDivision(id);
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Division deleted");
      }
    });
  }

  function handleAddDiv() {
    if (!newDivName.trim() || !newDivNumber.trim()) return;
    startTransition(async () => {
      const result = await createDivision({
        number: parseInt(newDivNumber),
        name: newDivName.trim(),
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Division created");
        setAddingDiv(false);
        setNewDivName("");
        setNewDivNumber("");
      }
    });
  }

  // ── Department handlers ───────────────────────────────────

  function startEditDept(dept: Department) {
    setEditingDept(dept.id);
    setEditDeptName(dept.name);
    setEditDeptDirector(dept.director ?? "");
  }

  function handleSaveDept(id: string) {
    startTransition(async () => {
      const result = await updateDepartment(id, {
        name: editDeptName.trim(),
        director: editDeptDirector.trim() || null,
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Department updated");
        setEditingDept(null);
      }
    });
  }

  function handleDeleteDept(id: string) {
    startTransition(async () => {
      const result = await deleteDepartment(id);
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Department deleted");
      }
    });
  }

  function handleAddDept(divisionId: string) {
    if (!newDeptName.trim()) return;
    startTransition(async () => {
      const result = await createDepartment({
        name: newDeptName.trim(),
        director: newDeptDirector.trim() || null,
        division_id: divisionId,
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Department created");
        setAddingDeptToDivId(null);
        setNewDeptName("");
        setNewDeptDirector("");
      }
    });
  }

  // ── Section handlers ──────────────────────────────────────

  function startEditSection(sec: Section) {
    setEditingSection(sec.id);
    setEditSectionName(sec.name);
    setEditSectionAssignee(sec.assignee ?? "");
    setEditSectionPostId(sec.post_id);
  }

  function handleSaveSection(id: string) {
    startTransition(async () => {
      const result = await updateSection(id, {
        name: editSectionName.trim(),
        assignee: editSectionAssignee.trim() || null,
        post_id: editSectionPostId || null,
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Section updated");
        setEditingSection(null);
      }
    });
  }

  function handleDeleteSection(id: string) {
    startTransition(async () => {
      const result = await deleteSection(id);
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Section deleted");
      }
    });
  }

  function handleAddSection(departmentId: string) {
    if (!newSectionName.trim()) return;
    startTransition(async () => {
      const result = await createSection({
        name: newSectionName.trim(),
        assignee: newSectionAssignee.trim() || null,
        department_id: departmentId,
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Section created");
        setAddingSectionToDeptId(null);
        setNewSectionName("");
        setNewSectionAssignee("");
      }
    });
  }

  // ── Responsibilities handlers ─────────────────────────────

  function startEditResponsibilities(sec: Section) {
    setEditingResponsibilities(sec.id);
    setEditResponsibilities([...(sec.responsibilities ?? [])]);
    setNewResponsibility("");
  }

  function handleSaveResponsibilities(id: string) {
    startTransition(async () => {
      const result = await updateSection(id, {
        responsibilities: editResponsibilities.filter((r) => r.trim()),
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Responsibilities updated");
        setEditingResponsibilities(null);
      }
    });
  }

  // ── Post handlers ─────────────────────────────────────────

  function startEditPost(post: Post) {
    setEditingPost(post.id);
    setEditPostTitle(post.title);
    setEditPostVfp(post.vfp ?? "");
    setEditPostDivId(post.division_id);
  }

  function handleSavePost(id: string) {
    startTransition(async () => {
      const result = await updatePost(id, {
        title: editPostTitle.trim(),
        vfp: editPostVfp.trim() || null,
        division_id: editPostDivId,
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Post updated");
        setEditingPost(null);
      }
    });
  }

  function handleDeletePost(id: string) {
    startTransition(async () => {
      const result = await deletePost(id);
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed");
      } else {
        toast.success("Post deleted");
      }
    });
  }

  // ── Link post to section ──────────────────────────────────

  function handleLinkPostToSection(sectionId: string, postId: string) {
    startTransition(async () => {
      const result = await updateSection(sectionId, { post_id: postId });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to link post");
      } else {
        toast.success("Post linked to section");
        setLinkingPostId(null);
      }
    });
  }

  // ── Reorder handlers ──────────────────────────────────────
  // Optimistic overrides keyed by parent id. Cleared once the server action
  // returns and the page revalidates with the new display_order.
  const [deptOrderOverride, setDeptOrderOverride] = useState<Record<string, string[]>>({});
  const [sectionOrderOverride, setSectionOrderOverride] = useState<Record<string, string[]>>({});

  function applyWithViewTransition(fn: () => void) {
    const doc = typeof document !== "undefined" ? document : null;
    const startVT = (doc as Document & { startViewTransition?: (cb: () => void) => unknown } | null)
      ?.startViewTransition;
    if (startVT) {
      startVT.call(doc, fn);
    } else {
      fn();
    }
  }

  function moveDepartment(deptId: string, siblings: Department[], direction: -1 | 1) {
    if (siblings.length === 0) return;
    const divisionId = siblings[0].division_id;
    const sorted = [...siblings].sort((a, b) => a.display_order - b.display_order);
    const index = sorted.findIndex((d) => d.id === deptId);
    if (index === -1) return;
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const newOrder = reordered.map((d) => d.id);

    applyWithViewTransition(() => {
      setDeptOrderOverride((prev) => ({ ...prev, [divisionId]: newOrder }));
    });

    startTransition(async () => {
      const result = await reorderDepartments(newOrder);
      if (result.error) {
        // Revert the optimistic override on failure.
        setDeptOrderOverride((prev) => {
          const next = { ...prev };
          delete next[divisionId];
          return next;
        });
        toast.error(typeof result.error === "string" ? result.error : "Failed to reorder");
      }
      // On success: keep the override until pruneStaleOverrides() sees the
      // server data has caught up. This prevents a one-frame flip back to
      // stale display_order values before revalidated props arrive.
    });
  }

  function moveSection(sectionId: string, siblings: Section[], direction: -1 | 1) {
    if (siblings.length === 0) return;
    const departmentId = siblings[0].department_id;
    const sorted = [...siblings].sort((a, b) => a.display_order - b.display_order);
    const index = sorted.findIndex((s) => s.id === sectionId);
    if (index === -1) return;
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const newOrder = reordered.map((s) => s.id);

    applyWithViewTransition(() => {
      setSectionOrderOverride((prev) => ({ ...prev, [departmentId]: newOrder }));
    });

    startTransition(async () => {
      const result = await reorderSections(newOrder);
      if (result.error) {
        setSectionOrderOverride((prev) => {
          const next = { ...prev };
          delete next[departmentId];
          return next;
        });
        toast.error(typeof result.error === "string" ? result.error : "Failed to reorder");
      }
    });
  }

  /**
   * Drop overrides whose ordering already matches the canonical display_order
   * coming back from the server. Call this in an effect whenever the
   * departments prop changes — it bridges the gap between the server action
   * resolving and the revalidated props arriving.
   */
  function pruneStaleOverrides(departments: Department[]) {
    setDeptOrderOverride((prev) => {
      const next: Record<string, string[]> = {};
      const byDivision: Record<string, Department[]> = {};
      for (const d of departments) {
        (byDivision[d.division_id] ??= []).push(d);
      }
      for (const [divId, override] of Object.entries(prev)) {
        const sorted = [...(byDivision[divId] ?? [])]
          .sort((a, b) => a.display_order - b.display_order)
          .map((d) => d.id);
        if (sorted.length !== override.length || sorted.some((id, i) => id !== override[i])) {
          next[divId] = override;
        }
      }
      return next;
    });
    setSectionOrderOverride((prev) => {
      const next: Record<string, string[]> = {};
      for (const dept of departments) {
        const override = prev[dept.id];
        if (!override) continue;
        const sorted = [...(dept.sections ?? [])]
          .sort((a, b) => a.display_order - b.display_order)
          .map((s) => s.id);
        if (sorted.length !== override.length || sorted.some((id, i) => id !== override[i])) {
          next[dept.id] = override;
        }
      }
      return next;
    });
  }

  /**
   * Sort a list of departments/sections, applying the optimistic override
   * (if any) for that parent. Items not in the override fall to the end in
   * their stable display_order — but in practice the override always covers
   * all current siblings so this only matters during a brief mismatch.
   */
  function sortWithOverride<T extends { id: string; display_order: number }>(
    items: T[],
    override: string[] | undefined,
  ): T[] {
    if (!override) return [...items].sort((a, b) => a.display_order - b.display_order);
    const indexById = new Map(override.map((id, i) => [id, i]));
    return [...items].sort((a, b) => {
      const ai = indexById.get(a.id);
      const bi = indexById.get(b.id);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.display_order - b.display_order;
    });
  }

  // ── Reset all editing state ───────────────────────────────

  function resetAll() {
    setEditingDiv(null);
    setEditingDept(null);
    setEditingSection(null);
    setEditingResponsibilities(null);
    setEditingPost(null);
    setAddingDiv(false);
    setAddingDeptToDivId(null);
    setAddingSectionToDeptId(null);
    setLinkingPostId(null);
  }

  return {
    isPending,
    // Division
    editingDiv, editDivName, setEditDivName, editDivNumber, setEditDivNumber,
    editDivExec, setEditDivExec, editDivVfp, setEditDivVfp, editDivColor, setEditDivColor,
    addingDiv, setAddingDiv, newDivName, setNewDivName, newDivNumber, setNewDivNumber,
    startEditDiv, handleSaveDiv, handleDeleteDiv, handleAddDiv,
    // Department
    editingDept, editDeptName, setEditDeptName, editDeptDirector, setEditDeptDirector,
    addingDeptToDivId, setAddingDeptToDivId, newDeptName, setNewDeptName, newDeptDirector, setNewDeptDirector,
    startEditDept, handleSaveDept, handleDeleteDept, handleAddDept,
    // Section
    editingSection, editSectionName, setEditSectionName, editSectionAssignee, setEditSectionAssignee,
    editSectionPostId, setEditSectionPostId,
    addingSectionToDeptId, setAddingSectionToDeptId, newSectionName, setNewSectionName, newSectionAssignee, setNewSectionAssignee,
    startEditSection, handleSaveSection, handleDeleteSection, handleAddSection,
    // Responsibilities
    editingResponsibilities, editResponsibilities, setEditResponsibilities,
    newResponsibility, setNewResponsibility,
    startEditResponsibilities, handleSaveResponsibilities,
    // Post
    editingPost, editPostTitle, setEditPostTitle, editPostVfp, setEditPostVfp,
    editPostDivId, setEditPostDivId,
    startEditPost, handleSavePost, handleDeletePost,
    // Link
    linkingPostId, setLinkingPostId, handleLinkPostToSection,
    // Reorder
    moveDepartment, moveSection, deptOrderOverride, sectionOrderOverride, sortWithOverride, pruneStaleOverrides,
    // Utility
    resetAll,
  } as const;
}

export type OrgEditingState = ReturnType<typeof useOrgEditing>;
