"use client";

import { useState } from "react";
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
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  User,
  BarChart3,
  Plus,
  Link2,
  ListChecks,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { toggleDivisionPrivacy } from "@/actions/admin";
import { cn } from "@/lib/utils";
import type { OrgData } from "./types";
import type { OrgEditingState } from "./use-org-editing";
import type { Division, Post, Department, Section } from "@/lib/types";

interface TreeViewProps extends OrgData {
  isEditing: boolean;
  editing: OrgEditingState;
}

export function TreeView({ divisions, posts, departments, statsByPost, employeesByPost, employees, currentUserName, isEditing, editing }: TreeViewProps) {
  const [expandedDivs, setExpandedDivs] = useState<Set<string>>(new Set(divisions.map((d) => d.id)));
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set(departments.map((d) => d.id)));
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  function toggle(set: Set<string>, setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sortedDivisions = [...divisions].sort((a, b) => a.number - b.number);

  const deptsByDivision: Record<string, Department[]> = {};
  for (const dept of departments) {
    if (!deptsByDivision[dept.division_id]) deptsByDivision[dept.division_id] = [];
    deptsByDivision[dept.division_id].push(dept);
  }

  const linkedPostIds = new Set<string>();
  for (const dept of departments) {
    for (const sec of dept.sections ?? []) {
      if (sec.post_id) linkedPostIds.add(sec.post_id);
    }
  }

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

  return (
    <div className="space-y-1">
      {sortedDivisions.map((div) => {
        const divDepts = editing.sortWithOverride(
          deptsByDivision[div.id] ?? [],
          editing.deptOrderOverride[div.id],
        );
        const divPosts = posts.filter((p) => p.division_id === div.id);
        const unlinkedPosts = divPosts.filter((p) => !linkedPostIds.has(p.id));
        const isExpanded = expandedDivs.has(div.id);
        const isEditingThis = editing.editingDiv === div.id;
        const childCount = divDepts.length + divPosts.length;
        const isCurrentUserDiv = !!currentUserName && div.executive === currentUserName;

        return (
          <div key={div.id}>
            {/* Division row */}
            <div className={cn("group flex items-center gap-1.5 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors", isCurrentUserDiv && "ring-1 ring-primary/40 bg-primary/5")}>
              <button
                onClick={() => toggle(expandedDivs, setExpandedDivs, div.id)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              {isEditing && isEditingThis ? (
                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Input value={editing.editDivNumber} onChange={(e) => editing.setEditDivNumber(e.target.value)} className="w-16 text-sm" type="number" min="1" placeholder="#" />
                    <Input value={editing.editDivName} onChange={(e) => editing.setEditDivName(e.target.value)} className="flex-1 text-sm" placeholder="Division name" />
                    <input type="color" value={editing.editDivColor} onChange={(e) => editing.setEditDivColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" title="Division color" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={editing.editDivExec || "__none__"} onValueChange={(v) => v && editing.setEditDivExec(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="flex-1 text-sm"><span>{editing.editDivExec || "No executive"}</span></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No executive</SelectItem>
                        {employees.map((e) => <SelectItem key={e.id} value={e.full_name}>{e.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={editing.editDivVfp} onChange={(e) => editing.setEditDivVfp(e.target.value)} className="flex-1 text-sm" placeholder="VFP (optional)" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => editing.handleSaveDiv(div.id)} disabled={editing.isPending}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => editing.resetAll()}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: div.color || "#6b7280" }} />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm">Div {div.number} – {div.name}</span>
                    {div.executive && <span className="text-xs text-muted-foreground ml-2">({div.executive})</span>}
                    {div.vfp && <p className="text-[10px] text-muted-foreground truncate mt-0.5">VFP: {div.vfp}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground mr-1 shrink-0">{divDepts.length} dept{divDepts.length !== 1 ? "s" : ""}</span>
                  {div.is_private && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground shrink-0" title="Hidden from non-admin users">
                      <EyeOff className="h-3 w-3" />
                      Admin only
                    </span>
                  )}
                  {isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={async () => {
                          const r = await toggleDivisionPrivacy(div.id, !div.is_private);
                          if (r.error) {
                            toast.error(typeof r.error === "string" ? r.error : "Failed to update");
                          } else {
                            toast.success(!div.is_private ? `${div.name} hidden from non-admins` : `${div.name} visible to everyone`);
                          }
                        }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title={div.is_private ? "Make visible to everyone" : "Hide from non-admins"}
                      >
                        {div.is_private ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                      <button onClick={() => editing.startEditDiv(div)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => editing.handleDeleteDiv(div.id)} disabled={editing.isPending || childCount > 0} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30" title={childCount > 0 ? "Remove departments and posts first" : "Delete division"}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Division children */}
            {isExpanded && (
              <div className="ml-4 border-l border-border">
                {divDepts.map((dept) => (
                  <DepartmentNode
                    key={dept.id}
                    dept={dept}
                    siblings={divDepts}
                    div={div}
                    posts={posts}
                    employees={employees}
                    statsByPost={statsByPost}
                    employeesByPost={employeesByPost}
                    expandedDepts={expandedDepts}
                    toggleDept={(id) => toggle(expandedDepts, setExpandedDepts, id)}
                    expandedSections={expandedSections}
                    toggleSection={(id) => toggle(expandedSections, setExpandedSections, id)}
                    isEditing={isEditing}
                    editing={editing}
                    currentUserName={currentUserName}
                  />
                ))}

                {/* Add department */}
                {isEditing && (
                  editing.addingDeptToDivId === div.id ? (
                    <div className="relative">
                      <div className="absolute left-0 top-[14px] w-4 border-t border-border" />
                      <div className="ml-6 py-2 flex items-center gap-2">
                        <Input value={editing.newDeptName} onChange={(e) => editing.setNewDeptName(e.target.value)} placeholder="Department name" className="flex-1 text-sm" autoFocus onKeyDown={(e) => { if (e.key === "Enter") editing.handleAddDept(div.id); }} />
                        <Select value={editing.newDeptDirector || "__none__"} onValueChange={(v) => v && editing.setNewDeptDirector(v === "__none__" ? "" : v)}>
                          <SelectTrigger className="w-48 text-sm"><span>{editing.newDeptDirector || "Director (optional)"}</span></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No director</SelectItem>
                            {employees.map((e) => <SelectItem key={e.id} value={e.full_name}>{e.full_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="ghost" onClick={() => editing.handleAddDept(div.id)} disabled={editing.isPending || !editing.newDeptName.trim()}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { editing.setAddingDeptToDivId(null); editing.setNewDeptName(""); editing.setNewDeptDirector(""); }}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-0 top-[14px] w-4 border-t border-border" />
                      <button onClick={() => editing.setAddingDeptToDivId(div.id)} className="ml-6 py-1.5 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                        <Plus className="h-3 w-3" /> Add department
                      </button>
                    </div>
                  )
                )}

                {/* Unlinked posts */}
                {unlinkedPosts.length > 0 && (
                  <div className="relative mt-1">
                    <div className="absolute left-0 top-[14px] w-4 border-t border-border" />
                    <div className="ml-6">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium py-1.5">Posts (not linked to a section)</p>
                      {unlinkedPosts.map((post) => (
                        <UnlinkedPostNode
                          key={post.id}
                          post={post}
                          div={div}
                          divisions={divisions}
                          statsByPost={statsByPost}
                          employeesByPost={employeesByPost}
                          availableSections={unlinkedSectionsByDivision[div.id] ?? []}
                          isEditing={isEditing}
                          editing={editing}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add division */}
      {isEditing && (
        editing.addingDiv ? (
          <div className="flex items-center gap-2 py-2 px-2 rounded-md bg-muted/30">
            <Input value={editing.newDivNumber} onChange={(e) => editing.setNewDivNumber(e.target.value)} className="w-16 text-sm" type="number" min="1" placeholder="#" autoFocus />
            <Input value={editing.newDivName} onChange={(e) => editing.setNewDivName(e.target.value)} className="flex-1 text-sm" placeholder="Division name" onKeyDown={(e) => { if (e.key === "Enter") editing.handleAddDiv(); }} />
            <Button size="sm" variant="ghost" onClick={editing.handleAddDiv} disabled={editing.isPending || !editing.newDivName.trim() || !editing.newDivNumber.trim()}><Check className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={() => { editing.setAddingDiv(false); editing.setNewDivName(""); editing.setNewDivNumber(""); }}><X className="h-3.5 w-3.5" /></Button>
          </div>
        ) : (
          <button onClick={() => editing.setAddingDiv(true)} className="py-2 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add division
          </button>
        )
      )}

      {sortedDivisions.length === 0 && !isEditing && (
        <p className="text-center py-8 text-muted-foreground">No divisions configured.</p>
      )}
    </div>
  );
}

// ── Department tree node ──────────────────────────────────

function DepartmentNode({
  dept, siblings, div, posts, employees, statsByPost, employeesByPost,
  expandedDepts, toggleDept, expandedSections, toggleSection,
  isEditing, editing, currentUserName,
}: {
  dept: Department;
  siblings: Department[];
  div: Division;
  posts: Post[];
  employees: { id: string; full_name: string }[];
  statsByPost: Record<string, string[]>;
  employeesByPost: Record<string, string[]>;
  expandedDepts: Set<string>;
  toggleDept: (id: string) => void;
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
  isEditing: boolean;
  editing: OrgEditingState;
  currentUserName?: string;
}) {
  const deptSections = dept.sections ?? [];
  const isDeptExpanded = expandedDepts.has(dept.id);
  const isEditingThisDept = editing.editingDept === dept.id;
  const isCurrentUserDept = !!currentUserName && dept.director === currentUserName;
  const sortedDeptSiblings = [...siblings].sort((a, b) => a.display_order - b.display_order);
  const deptIndex = sortedDeptSiblings.findIndex((d) => d.id === dept.id);
  const canMoveDeptUp = deptIndex > 0;
  const canMoveDeptDown = deptIndex >= 0 && deptIndex < sortedDeptSiblings.length - 1;

  return (
    <div className="relative" style={{ viewTransitionName: `tree-dept-${dept.id}` }}>
      <div className="absolute left-0 top-[18px] w-4 border-t border-border" />
      <div className="ml-4">
        {/* Department row */}
        <div className={cn("group/dept flex items-center gap-1.5 py-2 px-2 rounded-md hover:bg-muted/30 transition-colors", isCurrentUserDept && "ring-1 ring-primary/40 bg-primary/5")}>
          <button onClick={() => toggleDept(dept.id)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            {isDeptExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          {isEditing && isEditingThisDept ? (
            <div className="flex items-center gap-2 flex-1">
              <Input value={editing.editDeptName} onChange={(e) => editing.setEditDeptName(e.target.value)} className="flex-1 text-sm" placeholder="Department name" />
              <Select value={editing.editDeptDirector || "__none__"} onValueChange={(v) => v && editing.setEditDeptDirector(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-48 text-sm"><span>{editing.editDeptDirector || "No director"}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No director</SelectItem>
                  {employees.map((e) => <SelectItem key={e.id} value={e.full_name}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => editing.handleSaveDept(dept.id)} disabled={editing.isPending}><Check className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => editing.resetAll()}><X className="h-3.5 w-3.5" /></Button>
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{dept.name}</span>
                {dept.director && <span className="text-xs text-muted-foreground ml-2">Dir: {dept.director}</span>}
              </div>
              <span className="text-[10px] text-muted-foreground mr-1 shrink-0">{deptSections.length} sec{deptSections.length !== 1 ? "s" : ""}</span>
              {isEditing && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover/dept:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => editing.moveDepartment(dept.id, siblings, -1)} disabled={editing.isPending || !canMoveDeptUp} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30" title="Move up"><ChevronUp className="h-3 w-3" /></button>
                  <button onClick={() => editing.moveDepartment(dept.id, siblings, 1)} disabled={editing.isPending || !canMoveDeptDown} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30" title="Move down"><ChevronDown className="h-3 w-3" /></button>
                  <button onClick={() => editing.startEditDept(dept)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Pencil className="h-3 w-3" /></button>
                  <button onClick={() => editing.handleDeleteDept(dept.id)} disabled={editing.isPending || deptSections.length > 0} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30" title={deptSections.length > 0 ? "Remove sections first" : "Delete department"}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sections within department */}
        {isDeptExpanded && (
          <div className="ml-4 border-l border-border">
            {editing.sortWithOverride(deptSections, editing.sectionOrderOverride[dept.id]).map((sec) => (
              <SectionNode
                key={sec.id}
                sec={sec}
                siblings={deptSections}
                posts={posts}
                employees={employees}
                statsByPost={statsByPost}
                employeesByPost={employeesByPost}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                isEditing={isEditing}
                editing={editing}
                currentUserName={currentUserName}
              />
            ))}

            {/* Add section */}
            {isEditing && (
              editing.addingSectionToDeptId === dept.id ? (
                <div className="relative">
                  <div className="absolute left-0 top-[14px] w-4 border-t border-border" />
                  <div className="ml-6 py-2 flex items-center gap-2">
                    <Input value={editing.newSectionName} onChange={(e) => editing.setNewSectionName(e.target.value)} placeholder="Section name" className="flex-1 text-sm" autoFocus onKeyDown={(e) => { if (e.key === "Enter") editing.handleAddSection(dept.id); }} />
                    <Select value={editing.newSectionAssignee || "__none__"} onValueChange={(v) => v && editing.setNewSectionAssignee(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="w-48 text-sm"><span>{editing.newSectionAssignee || "Assignee (optional)"}</span></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No assignee</SelectItem>
                        {employees.map((e) => <SelectItem key={e.id} value={e.full_name}>{e.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" onClick={() => editing.handleAddSection(dept.id)} disabled={editing.isPending || !editing.newSectionName.trim()}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { editing.setAddingSectionToDeptId(null); editing.setNewSectionName(""); editing.setNewSectionAssignee(""); }}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-0 top-[14px] w-4 border-t border-border" />
                  <button onClick={() => editing.setAddingSectionToDeptId(dept.id)} className="ml-6 py-1.5 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                    <Plus className="h-3 w-3" /> Add section
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section tree node ─────────────────────────────────────

function SectionNode({
  sec, siblings, posts, employees, statsByPost, employeesByPost,
  expandedSections, toggleSection, isEditing, editing, currentUserName,
}: {
  sec: Section;
  siblings: Section[];
  posts: Post[];
  employees: { id: string; full_name: string }[];
  statsByPost: Record<string, string[]>;
  employeesByPost: Record<string, string[]>;
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
  isEditing: boolean;
  editing: OrgEditingState;
  currentUserName?: string;
}) {
  const isSectionExpanded = expandedSections.has(sec.id);
  const isEditingThisSection = editing.editingSection === sec.id;
  const isEditingTheseResp = editing.editingResponsibilities === sec.id;
  const linkedPost = sec.post_id ? posts.find((p) => p.id === sec.post_id) : null;
  const postStats = sec.post_id ? (statsByPost[sec.post_id] ?? []) : [];
  const postEmployees = sec.post_id ? (employeesByPost[sec.post_id] ?? []) : [];
  const isCurrentUserSection = !!currentUserName && (
    sec.assignee === currentUserName || postEmployees.includes(currentUserName)
  );
  const sortedSecSiblings = [...siblings].sort((a, b) => a.display_order - b.display_order);
  const secIndex = sortedSecSiblings.findIndex((s) => s.id === sec.id);
  const canMoveSecUp = secIndex > 0;
  const canMoveSecDown = secIndex >= 0 && secIndex < sortedSecSiblings.length - 1;

  return (
    <div className="relative" style={{ viewTransitionName: `tree-sec-${sec.id}` }}>
      <div className="absolute left-0 top-[18px] w-4 border-t border-border" />
      <div className="ml-4">
        <div className={cn("group/sec py-2 px-2 rounded-md hover:bg-muted/20 transition-colors", isCurrentUserSection && "ring-1 ring-primary/40 bg-primary/5")}>
          <div className="flex items-start gap-1.5">
            <button onClick={() => toggleSection(sec.id)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5">
              {isSectionExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>

            {isEditing && isEditingThisSection ? (
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex items-center gap-2">
                  <Input value={editing.editSectionName} onChange={(e) => editing.setEditSectionName(e.target.value)} className="flex-1 text-sm" placeholder="Section name" />
                  <Select value={editing.editSectionAssignee || "__none__"} onValueChange={(v) => v && editing.setEditSectionAssignee(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="w-48 text-sm"><span>{editing.editSectionAssignee || "No assignee"}</span></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No assignee</SelectItem>
                      {employees.map((e) => <SelectItem key={e.id} value={e.full_name}>{e.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={editing.editSectionPostId ?? "__none__"} onValueChange={(v) => editing.setEditSectionPostId(v === "__none__" ? null : v)}>
                    <SelectTrigger className="flex-1 text-sm">
                      <span>{editing.editSectionPostId ? posts.find((p) => p.id === editing.editSectionPostId)?.title ?? "Unknown post" : "No linked post"}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No linked post</SelectItem>
                      {posts.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => editing.handleSaveSection(sec.id)} disabled={editing.isPending}><Check className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => editing.resetAll()}><X className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <span className="text-sm">{sec.name}</span>
                  {sec.assignee && <span className="text-xs text-muted-foreground ml-2">({sec.assignee})</span>}
                  {linkedPost && (
                    <div className="mt-1 flex items-center gap-1">
                      <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">{linkedPost.title}</span>
                    </div>
                  )}
                  {postEmployees.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <User className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">{postEmployees.join(", ")}</span>
                    </div>
                  )}
                  {postStats.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <BarChart3 className="h-3 w-3 text-muted-foreground shrink-0" />
                      {postStats.map((s) => <Badge key={s} variant="outline" className="text-[9px] px-1.5 py-0">{s}</Badge>)}
                    </div>
                  )}
                  {(sec.responsibilities?.length ?? 0) > 0 && !isSectionExpanded && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <ListChecks className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[10px] text-muted-foreground">{sec.responsibilities.length} responsibilit{sec.responsibilities.length !== 1 ? "ies" : "y"}</span>
                    </div>
                  )}
                </div>
                {isEditing && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/sec:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => editing.moveSection(sec.id, siblings, -1)} disabled={editing.isPending || !canMoveSecUp} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30" title="Move up"><ChevronUp className="h-3 w-3" /></button>
                    <button onClick={() => editing.moveSection(sec.id, siblings, 1)} disabled={editing.isPending || !canMoveSecDown} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30" title="Move down"><ChevronDown className="h-3 w-3" /></button>
                    <button onClick={() => editing.startEditSection(sec)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Pencil className="h-3 w-3" /></button>
                    <button onClick={() => editing.handleDeleteSection(sec.id)} disabled={editing.isPending} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30" title="Delete section">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Expanded: Responsibilities */}
          {isSectionExpanded && !(isEditing && isEditingThisSection) && (
            <div className="ml-5 mt-2">
              {isEditing && isEditingTheseResp ? (
                <div className="space-y-1.5">
                  {editing.editResponsibilities.map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">{i + 1}.</span>
                      <Input
                        value={r}
                        onChange={(e) => {
                          const next = [...editing.editResponsibilities];
                          next[i] = e.target.value;
                          editing.setEditResponsibilities(next);
                        }}
                        className="flex-1 text-xs h-7"
                      />
                      <button onClick={() => editing.setEditResponsibilities(editing.editResponsibilities.filter((_, j) => j !== i))} className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">+</span>
                    <Input
                      value={editing.newResponsibility}
                      onChange={(e) => editing.setNewResponsibility(e.target.value)}
                      placeholder="Add responsibility..."
                      className="flex-1 text-xs h-7"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editing.newResponsibility.trim()) {
                          editing.setEditResponsibilities([...editing.editResponsibilities, editing.newResponsibility.trim()]);
                          editing.setNewResponsibility("");
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (editing.newResponsibility.trim()) {
                          editing.setEditResponsibilities([...editing.editResponsibilities, editing.newResponsibility.trim()]);
                          editing.setNewResponsibility("");
                        }
                      }}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    ><Plus className="h-3 w-3" /></button>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => editing.handleSaveResponsibilities(sec.id)} disabled={editing.isPending}><Check className="h-3 w-3 mr-1" /> Save</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => editing.resetAll()}><X className="h-3 w-3 mr-1" /> Cancel</Button>
                  </div>
                </div>
              ) : (
                <div>
                  {(sec.responsibilities?.length ?? 0) > 0 ? (
                    <ul className="space-y-0.5">
                      {sec.responsibilities.map((r, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-muted-foreground/50 shrink-0">&#8226;</span>{r}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 italic">No responsibilities defined</p>
                  )}
                  {isEditing && (
                    <button onClick={() => editing.startEditResponsibilities(sec)} className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                      <Pencil className="h-2.5 w-2.5" /> Edit responsibilities
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Unlinked post node ────────────────────────────────────

function UnlinkedPostNode({
  post, div, divisions, statsByPost, employeesByPost, availableSections, isEditing, editing,
}: {
  post: Post;
  div: Division;
  divisions: Division[];
  statsByPost: Record<string, string[]>;
  employeesByPost: Record<string, string[]>;
  availableSections: { id: string; name: string; deptName: string }[];
  isEditing: boolean;
  editing: OrgEditingState;
}) {
  const isEditingThisPost = editing.editingPost === post.id;
  const postStats = statsByPost[post.id] ?? [];
  const postEmployees = employeesByPost[post.id] ?? [];
  const isLinkingThis = editing.linkingPostId === post.id;

  return (
    <div className="group/post py-1.5 px-2 rounded-md hover:bg-muted/20 transition-colors">
      {isEditing && isEditingThisPost ? (
        <div className="flex items-center gap-2">
          <Input value={editing.editPostTitle} onChange={(e) => editing.setEditPostTitle(e.target.value)} className="flex-1 text-sm" />
          <Select value={editing.editPostDivId} onValueChange={(v) => v && editing.setEditPostDivId(v)}>
            <SelectTrigger className="w-[160px] text-sm">
              <span>{divisions.find((d) => d.id === editing.editPostDivId) ? `Div ${divisions.find((d) => d.id === editing.editPostDivId)!.number}` : "Division"}</span>
            </SelectTrigger>
            <SelectContent>
              {divisions.map((d) => <SelectItem key={d.id} value={d.id}>Div {d.number} – {d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => editing.handleSavePost(post.id)} disabled={editing.isPending}><Check className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={() => editing.resetAll()}><X className="h-3.5 w-3.5" /></Button>
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
                  {postStats.map((s) => <Badge key={s} variant="outline" className="text-[9px] px-1.5 py-0">{s}</Badge>)}
                </div>
              )}
            </div>
            {isEditing && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover/post:opacity-100 transition-opacity shrink-0">
                {availableSections.length > 0 && (
                  <button
                    onClick={() => editing.setLinkingPostId(isLinkingThis ? null : post.id)}
                    className={cn("p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors", isLinkingThis && "bg-muted text-foreground")}
                    title="Link to a section"
                  ><Link2 className="h-3 w-3" /></button>
                )}
                <button onClick={() => editing.startEditPost(post)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Pencil className="h-3 w-3" /></button>
                <button onClick={() => editing.handleDeletePost(post.id)} disabled={editing.isPending || postStats.length > 0 || postEmployees.length > 0} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30" title={postStats.length > 0 || postEmployees.length > 0 ? "Remove stats and assignments first" : "Delete post"}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {isEditing && isLinkingThis && (
            <div className="mt-2 ml-0.5 flex items-center gap-2">
              <Select value="__pick__" onValueChange={(v) => { if (v && v !== "__pick__") editing.handleLinkPostToSection(v, post.id); }}>
                <SelectTrigger className="flex-1 text-sm"><span className="text-muted-foreground">Select a section...</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__pick__" disabled>Select a section...</SelectItem>
                  {availableSections.map((sec) => <SelectItem key={sec.id} value={sec.id}>{sec.deptName} &rarr; {sec.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => editing.setLinkingPostId(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
