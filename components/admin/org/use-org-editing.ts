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
    setEditPostDivId(post.division_id);
  }

  function handleSavePost(id: string) {
    startTransition(async () => {
      const result = await updatePost(id, {
        title: editPostTitle.trim(),
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

  function moveDepartment(deptId: string, siblings: Department[], direction: -1 | 1) {
    const sorted = [...siblings].sort((a, b) => a.display_order - b.display_order);
    const index = sorted.findIndex((d) => d.id === deptId);
    if (index === -1) return;
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    startTransition(async () => {
      const result = await reorderDepartments(reordered.map((d) => d.id));
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to reorder");
      }
    });
  }

  function moveSection(sectionId: string, siblings: Section[], direction: -1 | 1) {
    const sorted = [...siblings].sort((a, b) => a.display_order - b.display_order);
    const index = sorted.findIndex((s) => s.id === sectionId);
    if (index === -1) return;
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    startTransition(async () => {
      const result = await reorderSections(reordered.map((s) => s.id));
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to reorder");
      }
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
    editingPost, editPostTitle, setEditPostTitle, editPostDivId, setEditPostDivId,
    startEditPost, handleSavePost, handleDeletePost,
    // Link
    linkingPostId, setLinkingPostId, handleLinkPostToSection,
    // Reorder
    moveDepartment, moveSection,
    // Utility
    resetAll,
  } as const;
}

export type OrgEditingState = ReturnType<typeof useOrgEditing>;
