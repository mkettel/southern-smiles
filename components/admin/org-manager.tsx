"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
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
} from "@/actions/admin";
import {
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  User,
  BarChart3,
  Plus,
  Link2,
  Unlink,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Division, Post, Department, Section } from "@/lib/types";

interface OrgManagerProps {
  divisions: Division[];
  posts: Post[];
  departments: Department[];
  statsByPost: Record<string, string[]>;
  employeesByPost: Record<string, string[]>;
  employees: { id: string; full_name: string }[];
}

export function OrgManager({
  divisions,
  posts,
  departments,
  statsByPost,
  employeesByPost,
  employees,
}: OrgManagerProps) {
  const [isPending, startTransition] = useTransition();

  // Expand/collapse state
  const [expandedDivs, setExpandedDivs] = useState<Set<string>>(
    new Set(divisions.map((d) => d.id))
  );
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(
    new Set(departments.map((d) => d.id))
  );
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Division editing
  const [editingDiv, setEditingDiv] = useState<string | null>(null);
  const [editDivName, setEditDivName] = useState("");
  const [editDivNumber, setEditDivNumber] = useState("");
  const [editDivExec, setEditDivExec] = useState("");
  const [editDivVfp, setEditDivVfp] = useState("");
  const [editDivColor, setEditDivColor] = useState("");

  // Department editing
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState("");
  const [editDeptDirector, setEditDeptDirector] = useState("");

  // Section editing
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState("");
  const [editSectionAssignee, setEditSectionAssignee] = useState("");
  const [editSectionPostId, setEditSectionPostId] = useState<string | null>(null);

  // Responsibilities editing
  const [editingResponsibilities, setEditingResponsibilities] = useState<string | null>(null);
  const [editResponsibilities, setEditResponsibilities] = useState<string[]>([]);
  const [newResponsibility, setNewResponsibility] = useState("");

  // Adding new items
  const [addingDeptToDivId, setAddingDeptToDivId] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptDirector, setNewDeptDirector] = useState("");
  const [addingSectionToDeptId, setAddingSectionToDeptId] = useState<string | null>(null);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionAssignee, setNewSectionAssignee] = useState("");

  // Post editing
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editPostTitle, setEditPostTitle] = useState("");
  const [editPostDivId, setEditPostDivId] = useState("");

  // Linking an unlinked post to a section
  const [linkingPostId, setLinkingPostId] = useState<string | null>(null);

  // Toggle helpers
  function toggle(set: Set<string>, setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Division handlers ──────────────────────────────────────

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

  // ── Department handlers ────────────────────────────────────

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

  // ── Section handlers ───────────────────────────────────────

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

  // ── Responsibilities handlers ──────────────────────────────

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

  // ── Post handlers ──────────────────────────────────────────

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

  // ── Link post to section handler ────────────────────────────

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

  // ── Derived data ───────────────────────────────────────────

  const sortedDivisions = [...divisions].sort((a, b) => a.number - b.number);

  // Group departments by division
  const deptsByDivision: Record<string, Department[]> = {};
  for (const dept of departments) {
    if (!deptsByDivision[dept.division_id]) deptsByDivision[dept.division_id] = [];
    deptsByDivision[dept.division_id].push(dept);
  }

  // Collect all post IDs that are linked to a section
  const linkedPostIds = new Set<string>();
  for (const dept of departments) {
    for (const sec of dept.sections ?? []) {
      if (sec.post_id) linkedPostIds.add(sec.post_id);
    }
  }

  // Sections without a linked post, grouped by division
  const unlinkedSectionsByDivision: Record<string, { id: string; name: string; deptName: string }[]> = {};
  for (const dept of departments) {
    for (const sec of dept.sections ?? []) {
      if (!sec.post_id) {
        const divId = dept.division_id;
        if (!unlinkedSectionsByDivision[divId]) unlinkedSectionsByDivision[divId] = [];
        unlinkedSectionsByDivision[divId].push({ id: sec.id, name: sec.name, deptName: dept.name });
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-1">
      {sortedDivisions.map((div) => {
        const divDepts = deptsByDivision[div.id] ?? [];
        const divPosts = posts.filter((p) => p.division_id === div.id);
        const unlinkedPosts = divPosts.filter((p) => !linkedPostIds.has(p.id));
        const isExpanded = expandedDivs.has(div.id);
        const isEditingThis = editingDiv === div.id;
        const childCount = divDepts.length + divPosts.length;

        return (
          <div key={div.id}>
            {/* ── Division row ── */}
            <div className="group flex items-center gap-1.5 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors">
              <button
                onClick={() => toggle(expandedDivs, setExpandedDivs, div.id)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              {isEditingThis ? (
                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={editDivNumber}
                      onChange={(e) => setEditDivNumber(e.target.value)}
                      className="w-16 text-sm"
                      type="number"
                      min="1"
                      placeholder="#"
                    />
                    <Input
                      value={editDivName}
                      onChange={(e) => setEditDivName(e.target.value)}
                      className="flex-1 text-sm"
                      placeholder="Division name"
                    />
                    <input
                      type="color"
                      value={editDivColor}
                      onChange={(e) => setEditDivColor(e.target.value)}
                      className="w-8 h-8 rounded border cursor-pointer"
                      title="Division color"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={editDivExec || "__none__"} onValueChange={(v) => v && setEditDivExec(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="flex-1 text-sm">
                        <span>{editDivExec || "No executive"}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No executive</SelectItem>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.full_name}>{e.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={editDivVfp}
                      onChange={(e) => setEditDivVfp(e.target.value)}
                      className="flex-1 text-sm"
                      placeholder="VFP (optional)"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleSaveDiv(div.id)} disabled={isPending}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingDiv(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: div.color || "#6b7280" }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm">
                      Div {div.number} – {div.name}
                    </span>
                    {div.executive && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({div.executive})
                      </span>
                    )}
                    {div.vfp && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        VFP: {div.vfp}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground mr-1 shrink-0">
                    {divDepts.length} dept{divDepts.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => startEditDiv(div)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteDiv(div.id)}
                      disabled={isPending || childCount > 0}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                      title={childCount > 0 ? "Remove departments and posts first" : "Delete division"}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ── Division children ── */}
            {isExpanded && (
              <div className="ml-4 border-l border-border">
                {/* Departments */}
                {divDepts.map((dept) => {
                  const deptSections = dept.sections ?? [];
                  const isDeptExpanded = expandedDepts.has(dept.id);
                  const isEditingThisDept = editingDept === dept.id;

                  return (
                    <div key={dept.id} className="relative">
                      <div className="absolute left-0 top-[18px] w-4 border-t border-border" />
                      <div className="ml-4">
                        {/* ── Department row ── */}
                        <div className="group/dept flex items-center gap-1.5 py-2 px-2 rounded-md hover:bg-muted/30 transition-colors">
                          <button
                            onClick={() => toggle(expandedDepts, setExpandedDepts, dept.id)}
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          >
                            {isDeptExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>

                          {isEditingThisDept ? (
                            <div className="flex items-center gap-2 flex-1">
                              <Input
                                value={editDeptName}
                                onChange={(e) => setEditDeptName(e.target.value)}
                                className="flex-1 text-sm"
                                placeholder="Department name"
                              />
                              <Select value={editDeptDirector || "__none__"} onValueChange={(v) => v && setEditDeptDirector(v === "__none__" ? "" : v)}>
                                <SelectTrigger className="w-48 text-sm">
                                  <span>{editDeptDirector || "No director"}</span>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">No director</SelectItem>
                                  {employees.map((e) => (
                                    <SelectItem key={e.id} value={e.full_name}>{e.full_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" variant="ghost" onClick={() => handleSaveDept(dept.id)} disabled={isPending}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingDept(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium">{dept.name}</span>
                                {dept.director && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    Dir: {dept.director}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground mr-1 shrink-0">
                                {deptSections.length} sec{deptSections.length !== 1 ? "s" : ""}
                              </span>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover/dept:opacity-100 transition-opacity shrink-0">
                                <button onClick={() => startEditDept(dept)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteDept(dept.id)}
                                  disabled={isPending || deptSections.length > 0}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                                  title={deptSections.length > 0 ? "Remove sections first" : "Delete department"}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* ── Sections within department ── */}
                        {isDeptExpanded && (
                          <div className="ml-4 border-l border-border">
                            {deptSections.map((sec) => {
                              const isSectionExpanded = expandedSections.has(sec.id);
                              const isEditingThisSection = editingSection === sec.id;
                              const isEditingTheseResp = editingResponsibilities === sec.id;
                              const linkedPost = sec.post_id ? posts.find((p) => p.id === sec.post_id) : null;
                              const postStats = sec.post_id ? (statsByPost[sec.post_id] ?? []) : [];
                              const postEmployees = sec.post_id ? (employeesByPost[sec.post_id] ?? []) : [];

                              return (
                                <div key={sec.id} className="relative">
                                  <div className="absolute left-0 top-[18px] w-4 border-t border-border" />
                                  <div className="ml-4">
                                    {/* ── Section row ── */}
                                    <div className="group/sec py-2 px-2 rounded-md hover:bg-muted/20 transition-colors">
                                      <div className="flex items-start gap-1.5">
                                        <button
                                          onClick={() => toggle(expandedSections, setExpandedSections, sec.id)}
                                          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
                                        >
                                          {isSectionExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                        </button>

                                        {isEditingThisSection ? (
                                          <div className="flex flex-col gap-2 flex-1">
                                            <div className="flex items-center gap-2">
                                              <Input
                                                value={editSectionName}
                                                onChange={(e) => setEditSectionName(e.target.value)}
                                                className="flex-1 text-sm"
                                                placeholder="Section name"
                                              />
                                              <Select value={editSectionAssignee || "__none__"} onValueChange={(v) => v && setEditSectionAssignee(v === "__none__" ? "" : v)}>
                                                <SelectTrigger className="w-48 text-sm">
                                                  <span>{editSectionAssignee || "No assignee"}</span>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="__none__">No assignee</SelectItem>
                                                  {employees.map((e) => (
                                                    <SelectItem key={e.id} value={e.full_name}>{e.full_name}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Select
                                                value={editSectionPostId ?? "__none__"}
                                                onValueChange={(v) => setEditSectionPostId(v === "__none__" ? null : v)}
                                              >
                                                <SelectTrigger className="flex-1 text-sm">
                                                  <span>
                                                    {editSectionPostId
                                                      ? posts.find((p) => p.id === editSectionPostId)?.title ?? "Unknown post"
                                                      : "No linked post"}
                                                  </span>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="__none__">No linked post</SelectItem>
                                                  {posts.map((p) => (
                                                    <SelectItem key={p.id} value={p.id}>
                                                      {p.title}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <Button size="sm" variant="ghost" onClick={() => handleSaveSection(sec.id)} disabled={isPending}>
                                                <Check className="h-3.5 w-3.5" />
                                              </Button>
                                              <Button size="sm" variant="ghost" onClick={() => setEditingSection(null)}>
                                                <X className="h-3.5 w-3.5" />
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <>
                                            <div className="flex-1 min-w-0">
                                              <span className="text-sm">{sec.name}</span>
                                              {sec.assignee && (
                                                <span className="text-xs text-muted-foreground ml-2">
                                                  ({sec.assignee})
                                                </span>
                                              )}

                                              {/* Linked post info */}
                                              {linkedPost && (
                                                <div className="mt-1 flex items-center gap-1">
                                                  <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                                  <span className="text-xs text-muted-foreground">
                                                    {linkedPost.title}
                                                  </span>
                                                </div>
                                              )}

                                              {/* Employees from linked post */}
                                              {postEmployees.length > 0 && (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                                  <span className="text-xs text-muted-foreground">
                                                    {postEmployees.join(", ")}
                                                  </span>
                                                </div>
                                              )}

                                              {/* Stats from linked post */}
                                              {postStats.length > 0 && (
                                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                  <BarChart3 className="h-3 w-3 text-muted-foreground shrink-0" />
                                                  {postStats.map((s) => (
                                                    <Badge key={s} variant="outline" className="text-[9px] px-1.5 py-0">
                                                      {s}
                                                    </Badge>
                                                  ))}
                                                </div>
                                              )}

                                              {/* Responsibility count indicator */}
                                              {(sec.responsibilities?.length ?? 0) > 0 && !isSectionExpanded && (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                  <ListChecks className="h-3 w-3 text-muted-foreground shrink-0" />
                                                  <span className="text-[10px] text-muted-foreground">
                                                    {sec.responsibilities.length} responsibilit{sec.responsibilities.length !== 1 ? "ies" : "y"}
                                                  </span>
                                                </div>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-0.5 opacity-0 group-hover/sec:opacity-100 transition-opacity shrink-0">
                                              <button onClick={() => startEditSection(sec)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                                <Pencil className="h-3 w-3" />
                                              </button>
                                              <button
                                                onClick={() => handleDeleteSection(sec.id)}
                                                disabled={isPending}
                                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                                                title="Delete section"
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </button>
                                            </div>
                                          </>
                                        )}
                                      </div>

                                      {/* ── Expanded: Responsibilities ── */}
                                      {isSectionExpanded && !isEditingThisSection && (
                                        <div className="ml-5 mt-2">
                                          {isEditingTheseResp ? (
                                            <div className="space-y-1.5">
                                              {editResponsibilities.map((r, i) => (
                                                <div key={i} className="flex items-center gap-1.5">
                                                  <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">{i + 1}.</span>
                                                  <Input
                                                    value={r}
                                                    onChange={(e) => {
                                                      const next = [...editResponsibilities];
                                                      next[i] = e.target.value;
                                                      setEditResponsibilities(next);
                                                    }}
                                                    className="flex-1 text-xs h-7"
                                                  />
                                                  <button
                                                    onClick={() => setEditResponsibilities(editResponsibilities.filter((_, j) => j !== i))}
                                                    className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                                                  >
                                                    <X className="h-3 w-3" />
                                                  </button>
                                                </div>
                                              ))}
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">+</span>
                                                <Input
                                                  value={newResponsibility}
                                                  onChange={(e) => setNewResponsibility(e.target.value)}
                                                  placeholder="Add responsibility..."
                                                  className="flex-1 text-xs h-7"
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Enter" && newResponsibility.trim()) {
                                                      setEditResponsibilities([...editResponsibilities, newResponsibility.trim()]);
                                                      setNewResponsibility("");
                                                    }
                                                  }}
                                                />
                                                <button
                                                  onClick={() => {
                                                    if (newResponsibility.trim()) {
                                                      setEditResponsibilities([...editResponsibilities, newResponsibility.trim()]);
                                                      setNewResponsibility("");
                                                    }
                                                  }}
                                                  className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                  <Plus className="h-3 w-3" />
                                                </button>
                                              </div>
                                              <div className="flex items-center gap-1 mt-1">
                                                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => handleSaveResponsibilities(sec.id)} disabled={isPending}>
                                                  <Check className="h-3 w-3 mr-1" /> Save
                                                </Button>
                                                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingResponsibilities(null)}>
                                                  <X className="h-3 w-3 mr-1" /> Cancel
                                                </Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div>
                                              {(sec.responsibilities?.length ?? 0) > 0 ? (
                                                <ul className="space-y-0.5">
                                                  {sec.responsibilities.map((r, i) => (
                                                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                                      <span className="text-muted-foreground/50 shrink-0">•</span>
                                                      {r}
                                                    </li>
                                                  ))}
                                                </ul>
                                              ) : (
                                                <p className="text-xs text-muted-foreground/50 italic">No responsibilities defined</p>
                                              )}
                                              <button
                                                onClick={() => startEditResponsibilities(sec)}
                                                className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                              >
                                                <Pencil className="h-2.5 w-2.5" />
                                                Edit responsibilities
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Add section button */}
                            {addingSectionToDeptId === dept.id ? (
                              <div className="relative">
                                <div className="absolute left-0 top-[14px] w-4 border-t border-border" />
                                <div className="ml-6 py-2 flex items-center gap-2">
                                  <Input
                                    value={newSectionName}
                                    onChange={(e) => setNewSectionName(e.target.value)}
                                    placeholder="Section name"
                                    className="flex-1 text-sm"
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") handleAddSection(dept.id); }}
                                  />
                                  <Select value={newSectionAssignee || "__none__"} onValueChange={(v) => v && setNewSectionAssignee(v === "__none__" ? "" : v)}>
                                    <SelectTrigger className="w-48 text-sm">
                                      <span>{newSectionAssignee || "Assignee (optional)"}</span>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">No assignee</SelectItem>
                                      {employees.map((e) => (
                                        <SelectItem key={e.id} value={e.full_name}>{e.full_name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button size="sm" variant="ghost" onClick={() => handleAddSection(dept.id)} disabled={isPending || !newSectionName.trim()}>
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => { setAddingSectionToDeptId(null); setNewSectionName(""); setNewSectionAssignee(""); }}>
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="relative">
                                <div className="absolute left-0 top-[14px] w-4 border-t border-border" />
                                <button
                                  onClick={() => setAddingSectionToDeptId(dept.id)}
                                  className="ml-6 py-1.5 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                >
                                  <Plus className="h-3 w-3" /> Add section
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Add department button */}
                {addingDeptToDivId === div.id ? (
                  <div className="relative">
                    <div className="absolute left-0 top-[14px] w-4 border-t border-border" />
                    <div className="ml-6 py-2 flex items-center gap-2">
                      <Input
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        placeholder="Department name"
                        className="flex-1 text-sm"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddDept(div.id); }}
                      />
                      <Select value={newDeptDirector || "__none__"} onValueChange={(v) => v && setNewDeptDirector(v === "__none__" ? "" : v)}>
                        <SelectTrigger className="w-48 text-sm">
                          <span>{newDeptDirector || "Director (optional)"}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No director</SelectItem>
                          {employees.map((e) => (
                            <SelectItem key={e.id} value={e.full_name}>{e.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" onClick={() => handleAddDept(div.id)} disabled={isPending || !newDeptName.trim()}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAddingDeptToDivId(null); setNewDeptName(""); setNewDeptDirector(""); }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute left-0 top-[14px] w-4 border-t border-border" />
                    <button
                      onClick={() => setAddingDeptToDivId(div.id)}
                      className="ml-6 py-1.5 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Add department
                    </button>
                  </div>
                )}

                {/* ── Unlinked Posts ── */}
                {unlinkedPosts.length > 0 && (
                  <div className="relative mt-1">
                    <div className="absolute left-0 top-[14px] w-4 border-t border-border" />
                    <div className="ml-6">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium py-1.5">
                        Posts (not linked to a section)
                      </p>
                      {unlinkedPosts.map((post) => {
                        const isEditingThisPost = editingPost === post.id;
                        const postStats = statsByPost[post.id] ?? [];
                        const postEmployees = employeesByPost[post.id] ?? [];

                        const availableSections = unlinkedSectionsByDivision[div.id] ?? [];
                        const isLinkingThis = linkingPostId === post.id;

                        return (
                          <div key={post.id} className="group/post py-1.5 px-2 rounded-md hover:bg-muted/20 transition-colors">
                            {isEditingThisPost ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editPostTitle}
                                  onChange={(e) => setEditPostTitle(e.target.value)}
                                  className="flex-1 text-sm"
                                />
                                <Select value={editPostDivId} onValueChange={(v) => v && setEditPostDivId(v)}>
                                  <SelectTrigger className="w-[160px] text-sm">
                                    <span>
                                      {divisions.find((d) => d.id === editPostDivId)
                                        ? `Div ${divisions.find((d) => d.id === editPostDivId)!.number}`
                                        : "Division"}
                                    </span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {divisions.map((d) => (
                                      <SelectItem key={d.id} value={d.id}>
                                        Div {d.number} – {d.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button size="sm" variant="ghost" onClick={() => handleSavePost(post.id)} disabled={isPending}>
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingPost(null)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div>
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium">{post.title}</span>
                                    {postEmployees.length > 0 && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                        <span className="text-xs text-muted-foreground">{postEmployees.join(", ")}</span>
                                      </div>
                                    )}
                                    {postStats.length > 0 && (
                                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                        <BarChart3 className="h-3 w-3 text-muted-foreground shrink-0" />
                                        {postStats.map((s) => (
                                          <Badge key={s} variant="outline" className="text-[9px] px-1.5 py-0">{s}</Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover/post:opacity-100 transition-opacity shrink-0">
                                    {availableSections.length > 0 && (
                                      <button
                                        onClick={() => setLinkingPostId(isLinkingThis ? null : post.id)}
                                        className={cn(
                                          "p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors",
                                          isLinkingThis && "bg-muted text-foreground"
                                        )}
                                        title="Link to a section"
                                      >
                                        <Link2 className="h-3 w-3" />
                                      </button>
                                    )}
                                    <button onClick={() => startEditPost(post)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => handleDeletePost(post.id)}
                                      disabled={isPending || postStats.length > 0 || postEmployees.length > 0}
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                                      title={postStats.length > 0 || postEmployees.length > 0 ? "Remove stats and assignments first" : "Delete post"}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* Link to section picker */}
                                {isLinkingThis && (
                                  <div className="mt-2 ml-0.5 flex items-center gap-2">
                                    <Select
                                      value="__pick__"
                                      onValueChange={(v) => {
                                        if (v && v !== "__pick__") {
                                          handleLinkPostToSection(v, post.id);
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="flex-1 text-sm">
                                        <span className="text-muted-foreground">Select a section...</span>
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__pick__" disabled>Select a section...</SelectItem>
                                        {availableSections.map((sec) => (
                                          <SelectItem key={sec.id} value={sec.id}>
                                            {sec.deptName} &rarr; {sec.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button size="sm" variant="ghost" onClick={() => setLinkingPostId(null)}>
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {sortedDivisions.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">
          No divisions configured.
        </p>
      )}
    </div>
  );
}
