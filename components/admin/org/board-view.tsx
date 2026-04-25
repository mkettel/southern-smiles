"use client";

import { useMemo, useTransition } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  X,
  GripVertical,
  Link2,
  ListChecks,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { toggleDivisionPrivacy } from "@/actions/admin";
import { PanContainer } from "./pan-container";
import type { OrgData } from "./types";
import type { OrgEditingState } from "./use-org-editing";
import type { Department, Division, Post, Section } from "@/lib/types";

interface BoardViewProps extends OrgData {
  isEditing: boolean;
  editing: OrgEditingState;
}

const whiteInputCls =
  "bg-white/20 border border-white/40 rounded px-1.5 py-1 text-white placeholder:text-white/60 text-[11px] outline-none focus:bg-white/30 focus:border-white/70 w-full";
const iconBtnCls =
  "p-1 rounded hover:bg-white/25 text-white/75 hover:text-white transition-colors disabled:opacity-50";
const fieldLabelCls =
  "text-[9px] font-bold uppercase tracking-widest opacity-70 block mb-0.5";

/** Tiny label + input combo used across all board edit forms. */
function LabeledField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className ?? "block"}>
      <span className={fieldLabelCls}>{label}</span>
      {children}
    </label>
  );
}

/**
 * Select an employee by full_name. Stores the display name (string) back to the
 * DB — no schema change needed since executive/director/assignee are text fields.
 * If the current value isn't in the employee list (legacy data, or someone who
 * was archived), it's shown as the first option so editing doesn't accidentally
 * clear it.
 */
function EmployeeSelect({
  value,
  onChange,
  employees,
  placeholder = "Unassigned",
}: {
  value: string;
  onChange: (next: string) => void;
  employees: { id: string; full_name: string }[];
  placeholder?: string;
}) {
  const trimmed = value.trim();
  const isKnown = employees.some((e) => e.full_name === trimmed);
  return (
    <select
      value={trimmed}
      onChange={(e) => onChange(e.target.value)}
      className={`${whiteInputCls} appearance-none cursor-pointer pr-6`}
    >
      <option value="" className="text-foreground">
        — {placeholder} —
      </option>
      {!isKnown && trimmed && (
        <option value={trimmed} className="text-foreground italic">
          {trimmed} (not in team)
        </option>
      )}
      {employees.map((emp) => (
        <option key={emp.id} value={emp.full_name} className="text-foreground">
          {emp.full_name}
        </option>
      ))}
    </select>
  );
}

/**
 * Dense org-chart board view. Each division is a colored vertical column with
 * departments and sections rendered as flat bands. When isEditing is true,
 * inline controls (pencil, trash, plus) appear on hover for every level.
 */
export function BoardView({
  divisions,
  posts,
  departments,
  statsByPost,
  employeesByPost,
  employees,
  currentUserName,
  isEditing,
  editing,
}: BoardViewProps) {
  const { sortedDivisions, deptsByDivision, postsByDivision, linkedPostIds } =
    useMemo(() => {
      const sortedDivisions = [...divisions].sort(
        (a, b) => a.number - b.number,
      );

      const deptsByDivision: Record<string, Department[]> = {};
      for (const dept of departments) {
        (deptsByDivision[dept.division_id] ??= []).push(dept);
      }

      const postsByDivision: Record<string, Post[]> = {};
      for (const post of posts) {
        (postsByDivision[post.division_id] ??= []).push(post);
      }

      const linkedPostIds = new Set<string>();
      for (const dept of departments) {
        for (const sec of dept.sections ?? []) {
          if (sec.post_id) linkedPostIds.add(sec.post_id);
        }
      }

      return {
        sortedDivisions,
        deptsByDivision,
        postsByDivision,
        linkedPostIds,
      };
    }, [divisions, departments, posts]);

  const postsById = useMemo(() => {
    const map = new Map<string, Post>();
    for (const p of posts) map.set(p.id, p);
    return map;
  }, [posts]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Drag to pan · scroll to move · ⌘/Ctrl + scroll to zoom
        {isEditing && (
          <span className="ml-2 text-foreground">· Edit mode on</span>
        )}
      </p>

      <PanContainer className="border rounded-lg bg-background h-[calc(100vh-240px)] min-h-[500px]">
        <div
          data-pan-handle
          className="flex gap-2 p-4 min-w-max min-h-full items-stretch"
        >
          {sortedDivisions.map((div) => (
            <DivisionColumn
              key={div.id}
              division={div}
              depts={deptsByDivision[div.id] ?? []}
              unlinkedPosts={(postsByDivision[div.id] ?? []).filter(
                (p) => !linkedPostIds.has(p.id),
              )}
              postsById={postsById}
              statsByPost={statsByPost}
              employeesByPost={employeesByPost}
              employees={employees}
              currentUserName={currentUserName}
              isEditing={isEditing}
              editing={editing}
            />
          ))}

          {isEditing && <AddDivisionColumn editing={editing} />}

          {sortedDivisions.length === 0 && !isEditing && (
            <div className="flex items-center justify-center w-full text-muted-foreground text-sm py-12">
              No divisions defined yet.
            </div>
          )}
        </div>
      </PanContainer>
    </div>
  );
}

// ─── Division ────────────────────────────────────────────────────────────────

function DivisionColumn({
  division: div,
  depts,
  unlinkedPosts,
  postsById,
  statsByPost,
  employeesByPost,
  employees,
  currentUserName,
  isEditing,
  editing,
}: {
  division: Division;
  depts: Department[];
  unlinkedPosts: Post[];
  postsById: Map<string, Post>;
  statsByPost: Record<string, string[]>;
  employeesByPost: Record<string, string[]>;
  employees: { id: string; full_name: string }[];
  currentUserName?: string;
  isEditing: boolean;
  editing: OrgEditingState;
}) {
  const isEditingThis = editing.editingDiv === div.id;
  const isAddingDept = editing.addingDeptToDivId === div.id;
  const [privacyPending, startPrivacyTransition] = useTransition();
  // Live-preview the color while editing; revert to saved color on cancel.
  const color =
    (isEditingThis && editing.editDivColor) || div.color || "#6b7280";
  const isCurrentUserDiv =
    !!currentUserName && div.executive === currentUserName;

  const sortedDepts = editing.sortWithOverride(depts, editing.deptOrderOverride[div.id]);

  return (
    <div
      className="w-80 shrink-0 flex flex-col text-white rounded-md overflow-hidden shadow-sm"
      style={{ backgroundColor: color }}
    >
      {/* Division header — fixed height when displaying; grows to fit form when editing */}
      <div
        className={`${
          isEditingThis ? "px-3 py-3" : "h-24 px-3 py-2.5"
        } border-b-2 border-white/30 flex flex-col items-center justify-center text-center relative group/div`}
        style={{
          boxShadow: isCurrentUserDiv
            ? "inset 0 0 0 3px rgba(255,255,255,0.7)"
            : undefined,
        }}
      >
        {isEditingThis ? (
          <DivisionEditForm division={div} editing={editing} employees={employees} />
        ) : (
          <>
            <div className="flex items-center justify-center gap-2">
              <h3 className="font-bold text-sm tracking-wide uppercase leading-tight">
                {div.name} Division
              </h3>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold rounded-full bg-white/25 tabular-nums">
                {div.number}
              </span>
            </div>
            {div.executive ? (
              <div className="mt-2 leading-tight">
                <div className="text-[10px] uppercase tracking-wider opacity-80">
                  {div.name.split(" ")[0]} Executive
                </div>
                <div className="text-[11px] font-medium mt-0.5">
                  {div.executive}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-[10px] uppercase tracking-wider opacity-60 italic">
                No executive assigned
              </div>
            )}

            {div.is_private && (
              <div
                className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wider"
                title="Hidden from non-admin users"
              >
                <EyeOff className="h-2.5 w-2.5" />
                Admin only
              </div>
            )}
            {isEditing && (
              <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover/div:opacity-100 transition-opacity">
                <button
                  onClick={() =>
                    startPrivacyTransition(async () => {
                      const r = await toggleDivisionPrivacy(div.id, !div.is_private);
                      if (r.error) {
                        toast.error(typeof r.error === "string" ? r.error : "Failed to update");
                      } else {
                        toast.success(
                          !div.is_private
                            ? `${div.name} hidden from non-admins`
                            : `${div.name} visible to everyone`,
                        );
                      }
                    })
                  }
                  disabled={privacyPending}
                  className={iconBtnCls}
                  aria-label={div.is_private ? "Make division visible" : "Hide division from non-admins"}
                  title={div.is_private ? "Make visible to everyone" : "Hide from non-admins"}
                >
                  {div.is_private ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => editing.startEditDiv(div)}
                  className={iconBtnCls}
                  aria-label="Edit division"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${div.name} Division and everything under it?`,
                      )
                    ) {
                      editing.handleDeleteDiv(div.id);
                    }
                  }}
                  className={iconBtnCls}
                  aria-label="Delete division"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 bg-white/5 px-3 py-4 space-y-5">
        {sortedDepts.map((dept) => (
          <DepartmentBlock
            key={dept.id}
            dept={dept}
            siblings={sortedDepts}
            postsById={postsById}
            statsByPost={statsByPost}
            employeesByPost={employeesByPost}
            employees={employees}
            isEditing={isEditing}
            editing={editing}
          />
        ))}

        {isEditing && (
          <div>
            {isAddingDept ? (
              <AddDepartmentForm
                divisionId={div.id}
                editing={editing}
                employees={employees}
              />
            ) : (
              <button
                onClick={() => editing.setAddingDeptToDivId(div.id)}
                className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] rounded border border-dashed border-white/40 hover:bg-white/10 hover:border-white/70 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add department
              </button>
            )}
          </div>
        )}

        {unlinkedPosts.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
              Other Posts
            </div>
            <div className="pl-3 border-l border-white/25 space-y-3">
              {unlinkedPosts.map((post) => (
                <PostBlock
                  key={post.id}
                  post={post}
                  stats={statsByPost[post.id] ?? []}
                  employees={employeesByPost[post.id] ?? []}
                  isEditing={isEditing}
                  editing={editing}
                />
              ))}
            </div>
          </div>
        )}

        {depts.length === 0 && unlinkedPosts.length === 0 && !isEditing && (
          <p className="text-[11px] text-center py-6 opacity-70 italic">
            No departments yet
          </p>
        )}
      </div>

      {/* VFP footer */}
      {div.vfp && !isEditingThis && (
        <div className="px-3 py-2.5 border-t border-white/25 bg-black/25">
          <div className="text-[9px] font-bold uppercase tracking-widest opacity-80 mb-0.5">
            VFP
          </div>
          <p className="text-[11px] leading-snug">{div.vfp}</p>
        </div>
      )}
    </div>
  );
}

function DivisionEditForm({
  division,
  editing,
  employees,
}: {
  division: Division;
  editing: OrgEditingState;
  employees: { id: string; full_name: string }[];
}) {
  return (
    <div className="w-full space-y-1.5 text-left">
      <div className="grid grid-cols-[auto_1fr_3.5rem] gap-1.5 items-end">
        <LabeledField label="Color">
          <input
            type="color"
            value={editing.editDivColor}
            onChange={(e) => editing.setEditDivColor(e.target.value)}
            className="w-8 h-[26px] rounded border border-white/40 cursor-pointer bg-transparent"
            title="Division color"
          />
        </LabeledField>
        <LabeledField label="Name">
          <input
            value={editing.editDivName}
            onChange={(e) => editing.setEditDivName(e.target.value)}
            className={whiteInputCls}
          />
        </LabeledField>
        <LabeledField label="Number">
          <input
            type="number"
            value={editing.editDivNumber}
            onChange={(e) => editing.setEditDivNumber(e.target.value)}
            className={`${whiteInputCls} tabular-nums`}
          />
        </LabeledField>
      </div>
      <LabeledField label="Executive">
        <EmployeeSelect
          value={editing.editDivExec}
          onChange={editing.setEditDivExec}
          employees={employees}
        />
      </LabeledField>
      <LabeledField label="VFP">
        <input
          value={editing.editDivVfp}
          onChange={(e) => editing.setEditDivVfp(e.target.value)}
          placeholder="Optional"
          className={whiteInputCls}
        />
      </LabeledField>
      <div className="flex justify-end gap-1 pt-0.5">
        <button
          onClick={() => editing.handleSaveDiv(division.id)}
          disabled={editing.isPending || !editing.editDivName.trim()}
          className={iconBtnCls}
          aria-label="Save"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => editing.resetAll()}
          className={iconBtnCls}
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddDivisionColumn({ editing }: { editing: OrgEditingState }) {
  if (editing.addingDiv) {
    return (
      <div className="w-72 shrink-0 bg-muted/40 border-2 border-dashed rounded-md p-3 space-y-2 self-start">
        <div className="text-xs font-semibold text-foreground">New Division</div>
        <label className="block">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block mb-0.5">
            Name
          </span>
          <input
            value={editing.newDivName}
            onChange={(e) => editing.setNewDivName(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded border bg-background"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") editing.handleAddDiv();
              if (e.key === "Escape") editing.setAddingDiv(false);
            }}
          />
        </label>
        <label className="block">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block mb-0.5">
            Number
          </span>
          <input
            type="number"
            value={editing.newDivNumber}
            onChange={(e) => editing.setNewDivNumber(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded border bg-background tabular-nums"
          />
        </label>
        <div className="flex justify-end gap-1">
          <button
            onClick={editing.handleAddDiv}
            disabled={
              editing.isPending ||
              !editing.newDivName.trim() ||
              !editing.newDivNumber.trim()
            }
            className="p-1 rounded hover:bg-muted text-foreground disabled:opacity-50"
            aria-label="Save"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => editing.setAddingDiv(false)}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => editing.setAddingDiv(true)}
      className="w-72 shrink-0 self-start flex flex-col items-center justify-center gap-1 h-24 text-xs text-muted-foreground border-2 border-dashed rounded-md hover:bg-muted/30 hover:text-foreground hover:border-muted-foreground transition-colors"
    >
      <Plus className="h-4 w-4" />
      Add division
    </button>
  );
}

// ─── Department ──────────────────────────────────────────────────────────────

function DepartmentBlock({
  dept,
  siblings,
  postsById,
  statsByPost,
  employeesByPost,
  employees,
  isEditing,
  editing,
}: {
  dept: Department;
  siblings: Department[];
  postsById: Map<string, Post>;
  statsByPost: Record<string, string[]>;
  employeesByPost: Record<string, string[]>;
  employees: { id: string; full_name: string }[];
  isEditing: boolean;
  editing: OrgEditingState;
}) {
  const sections = editing.sortWithOverride(
    dept.sections ?? [],
    editing.sectionOrderOverride[dept.id],
  );
  const isEditingThis = editing.editingDept === dept.id;
  const isAddingSection = editing.addingSectionToDeptId === dept.id;
  const sortedSiblings = [...siblings].sort((a, b) => a.display_order - b.display_order);
  const deptIndex = sortedSiblings.findIndex((d) => d.id === dept.id);
  const canMoveDeptUp = deptIndex > 0;
  const canMoveDeptDown = deptIndex >= 0 && deptIndex < sortedSiblings.length - 1;

  return (
    <div
      className="group/dept"
      style={{ viewTransitionName: `dept-${dept.id}` }}
    >
      {/* Dept header — display or edit */}
      {isEditingThis ? (
        <DepartmentEditForm dept={dept} editing={editing} employees={employees} />
      ) : (
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold leading-tight">
              {dept.name}
            </div>
            {dept.director && (
              <div className="text-[11px] opacity-80 mt-0.5">
                Director ·{" "}
                <span className="font-medium opacity-100">{dept.director}</span>
              </div>
            )}
          </div>
          {isEditing && (
            <div className="flex gap-0.5 opacity-0 group-hover/dept:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => editing.moveDepartment(dept.id, siblings, -1)}
                disabled={editing.isPending || !canMoveDeptUp}
                className={iconBtnCls}
                aria-label="Move department up"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => editing.moveDepartment(dept.id, siblings, 1)}
                disabled={editing.isPending || !canMoveDeptDown}
                className={iconBtnCls}
                aria-label="Move department down"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <button
                onClick={() => editing.startEditDept(dept)}
                className={iconBtnCls}
                aria-label="Edit department"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete "${dept.name}" department and its sections?`,
                    )
                  ) {
                    editing.handleDeleteDept(dept.id);
                  }
                }}
                className={iconBtnCls}
                aria-label="Delete department"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sections */}
      {(sections.length > 0 || isEditing) && (
        <div className="mt-2 pl-3 border-l border-white/30 space-y-3">
          {sections.map((sec) => (
            <SectionBlock
              key={sec.id}
              sec={sec}
              siblings={sections}
              postsById={postsById}
              statsByPost={statsByPost}
              employeesByPost={employeesByPost}
              employees={employees}
              isEditing={isEditing}
              editing={editing}
            />
          ))}

          {isEditing && (
            <>
              {isAddingSection ? (
                <AddSectionForm
                  deptId={dept.id}
                  editing={editing}
                  employees={employees}
                />
              ) : (
                <button
                  onClick={() => editing.setAddingSectionToDeptId(dept.id)}
                  className="flex items-center gap-1 text-[10.5px] text-white/70 hover:text-white transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add section
                </button>
              )}
            </>
          )}
        </div>
      )}

      {sections.length === 0 && !isEditing && (
        <div className="mt-1.5 text-[10px] italic opacity-60">No sections</div>
      )}
    </div>
  );
}

function DepartmentEditForm({
  dept,
  editing,
  employees,
}: {
  dept: Department;
  editing: OrgEditingState;
  employees: { id: string; full_name: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <LabeledField label="Department">
        <input
          value={editing.editDeptName}
          onChange={(e) => editing.setEditDeptName(e.target.value)}
          className={whiteInputCls}
        />
      </LabeledField>
      <LabeledField label="Director">
        <EmployeeSelect
          value={editing.editDeptDirector}
          onChange={editing.setEditDeptDirector}
          employees={employees}
        />
      </LabeledField>
      <div className="flex justify-end gap-1">
        <button
          onClick={() => editing.handleSaveDept(dept.id)}
          disabled={editing.isPending || !editing.editDeptName.trim()}
          className={iconBtnCls}
          aria-label="Save"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => editing.resetAll()}
          className={iconBtnCls}
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddDepartmentForm({
  divisionId,
  editing,
  employees,
}: {
  divisionId: string;
  editing: OrgEditingState;
  employees: { id: string; full_name: string }[];
}) {
  return (
    <div className="space-y-1.5 p-2 rounded border border-dashed border-white/50 bg-white/10">
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">
        New Department
      </div>
      <LabeledField label="Name">
        <input
          value={editing.newDeptName}
          onChange={(e) => editing.setNewDeptName(e.target.value)}
          className={whiteInputCls}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") editing.handleAddDept(divisionId);
            if (e.key === "Escape") editing.setAddingDeptToDivId(null);
          }}
        />
      </LabeledField>
      <LabeledField label="Director">
        <EmployeeSelect
          value={editing.newDeptDirector}
          onChange={editing.setNewDeptDirector}
          employees={employees}
        />
      </LabeledField>
      <div className="flex justify-end gap-1">
        <button
          onClick={() => editing.handleAddDept(divisionId)}
          disabled={editing.isPending || !editing.newDeptName.trim()}
          className={iconBtnCls}
          aria-label="Add"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => editing.setAddingDeptToDivId(null)}
          className={iconBtnCls}
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function SectionBlock({
  sec,
  siblings,
  postsById,
  statsByPost,
  employeesByPost,
  employees,
  isEditing,
  editing,
}: {
  sec: Section;
  siblings: Section[];
  postsById: Map<string, Post>;
  statsByPost: Record<string, string[]>;
  employeesByPost: Record<string, string[]>;
  employees: { id: string; full_name: string }[];
  isEditing: boolean;
  editing: OrgEditingState;
}) {
  const linkedPost = sec.post_id ? postsById.get(sec.post_id) : null;
  const postStats = linkedPost ? (statsByPost[linkedPost.id] ?? []) : [];
  const postEmployees = linkedPost
    ? (employeesByPost[linkedPost.id] ?? [])
    : [];
  const assignee =
    sec.assignee ??
    (postEmployees.length > 0 ? postEmployees.join(", ") : null);

  const isEditingThis = editing.editingSection === sec.id;
  const isEditingResp = editing.editingResponsibilities === sec.id;
  const sortedSiblings = [...siblings].sort((a, b) => a.display_order - b.display_order);
  const secIndex = sortedSiblings.findIndex((s) => s.id === sec.id);
  const canMoveSecUp = secIndex > 0;
  const canMoveSecDown = secIndex >= 0 && secIndex < sortedSiblings.length - 1;

  return (
    <div
      className="group/sec"
      style={{ viewTransitionName: `sec-${sec.id}` }}
    >
      {isEditingThis ? (
        <SectionEditForm sec={sec} editing={editing} employees={employees} />
      ) : (
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-wider">
              {sec.name} Section
            </div>
            {linkedPost && isEditing && editing.editingPost === linkedPost.id ? (
              <div className="mt-1 space-y-1.5 group/postedit">
                <input
                  value={editing.editPostTitle}
                  onChange={(e) => editing.setEditPostTitle(e.target.value)}
                  className={whiteInputCls}
                  placeholder="Post title"
                />
                <input
                  value={editing.editPostVfp}
                  onChange={(e) => editing.setEditPostVfp(e.target.value)}
                  className={whiteInputCls}
                  placeholder="VFP — what this post produces"
                  maxLength={500}
                />
                <div className="flex justify-end gap-1">
                  <button
                    onClick={() => editing.handleSavePost(linkedPost.id)}
                    disabled={editing.isPending || !editing.editPostTitle.trim()}
                    className={iconBtnCls}
                    aria-label="Save post"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => editing.resetAll()}
                    className={iconBtnCls}
                    aria-label="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              (linkedPost?.title || assignee) && (
                <div className="text-[11px] mt-0.5 group/linkedpost">
                  {linkedPost?.title && (
                    <span className="italic opacity-90">{linkedPost.title}</span>
                  )}
                  {assignee && (
                    <span className="font-medium">
                      {linkedPost?.title ? " · " : ""}
                      {assignee}
                    </span>
                  )}
                  {linkedPost && isEditing && (
                    <button
                      onClick={(e) => { e.stopPropagation(); editing.startEditPost(linkedPost); }}
                      className="ml-1 opacity-0 group-hover/linkedpost:opacity-100 inline-flex items-center align-middle transition-opacity"
                      aria-label="Edit post"
                      title="Edit post"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                  )}
                  {linkedPost?.vfp && (
                    <div className="italic opacity-75 leading-tight mt-0.5">
                      VFP: {linkedPost.vfp}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
          {isEditing && (
            <div className="flex gap-0.5 opacity-0 group-hover/sec:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => editing.moveSection(sec.id, siblings, -1)}
                disabled={editing.isPending || !canMoveSecUp}
                className={iconBtnCls}
                aria-label="Move section up"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => editing.moveSection(sec.id, siblings, 1)}
                disabled={editing.isPending || !canMoveSecDown}
                className={iconBtnCls}
                aria-label="Move section down"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <button
                onClick={() => editing.startEditSection(sec)}
                className={iconBtnCls}
                aria-label="Edit section"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete "${sec.name}" section?`)) {
                    editing.handleDeleteSection(sec.id);
                  }
                }}
                className={iconBtnCls}
                aria-label="Delete section"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Responsibilities + stats */}
      {(sec.responsibilities.length > 0 ||
        postStats.length > 0 ||
        isEditing) && (
        <div className="mt-1.5 pl-3 border-l border-white/15 space-y-1.5">
          {isEditingResp ? (
            <ResponsibilitiesEditor sec={sec} editing={editing} />
          ) : (
            <>
              {sec.responsibilities.length > 0 && (
                <div className="group/resp flex items-start gap-1.5">
                  <ul className="flex-1 space-y-0.5">
                    {sec.responsibilities.map((r, i) => (
                      <li
                        key={i}
                        className="text-[10.5px] leading-snug opacity-80"
                      >
                        {r}
                      </li>
                    ))}
                  </ul>
                  {isEditing && (
                    <button
                      onClick={() => editing.startEditResponsibilities(sec)}
                      className={`${iconBtnCls} opacity-0 group-hover/resp:opacity-100 transition-opacity shrink-0`}
                      aria-label="Edit responsibilities"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
              {isEditing && sec.responsibilities.length === 0 && (
                <button
                  onClick={() => editing.startEditResponsibilities(sec)}
                  className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white transition-colors"
                >
                  <ListChecks className="h-3 w-3" />
                  Add responsibilities
                </button>
              )}
              {postStats.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest opacity-70">
                    Stats
                  </div>
                  <ul className="mt-0.5 space-y-0.5">
                    {postStats.map((s) => (
                      <li
                        key={s}
                        className="text-[10.5px] leading-snug opacity-90"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionEditForm({
  sec,
  editing,
  employees,
}: {
  sec: Section;
  editing: OrgEditingState;
  employees: { id: string; full_name: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <LabeledField label="Section">
        <input
          value={editing.editSectionName}
          onChange={(e) => editing.setEditSectionName(e.target.value)}
          className={whiteInputCls}
        />
      </LabeledField>
      <LabeledField label="Assignee">
        <EmployeeSelect
          value={editing.editSectionAssignee}
          onChange={editing.setEditSectionAssignee}
          employees={employees}
        />
      </LabeledField>
      <div className="flex justify-end gap-1">
        <button
          onClick={() => editing.handleSaveSection(sec.id)}
          disabled={editing.isPending || !editing.editSectionName.trim()}
          className={iconBtnCls}
          aria-label="Save"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => editing.resetAll()}
          className={iconBtnCls}
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddSectionForm({
  deptId,
  editing,
  employees,
}: {
  deptId: string;
  editing: OrgEditingState;
  employees: { id: string; full_name: string }[];
}) {
  return (
    <div className="space-y-1.5 p-2 rounded border border-dashed border-white/50 bg-white/10">
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">
        New Section
      </div>
      <LabeledField label="Name">
        <input
          value={editing.newSectionName}
          onChange={(e) => editing.setNewSectionName(e.target.value)}
          className={whiteInputCls}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") editing.handleAddSection(deptId);
            if (e.key === "Escape") editing.setAddingSectionToDeptId(null);
          }}
        />
      </LabeledField>
      <LabeledField label="Assignee">
        <EmployeeSelect
          value={editing.newSectionAssignee}
          onChange={editing.setNewSectionAssignee}
          employees={employees}
        />
      </LabeledField>
      <div className="flex justify-end gap-1">
        <button
          onClick={() => editing.handleAddSection(deptId)}
          disabled={editing.isPending || !editing.newSectionName.trim()}
          className={iconBtnCls}
          aria-label="Add"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => editing.setAddingSectionToDeptId(null)}
          className={iconBtnCls}
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Responsibilities editor ─────────────────────────────────────────────────

function ResponsibilitiesEditor({
  sec,
  editing,
}: {
  sec: Section;
  editing: OrgEditingState;
}) {
  function updateAt(index: number, value: string) {
    const next = [...editing.editResponsibilities];
    next[index] = value;
    editing.setEditResponsibilities(next);
  }
  function removeAt(index: number) {
    editing.setEditResponsibilities(
      editing.editResponsibilities.filter((_, i) => i !== index),
    );
  }
  function addItem() {
    if (!editing.newResponsibility.trim()) return;
    editing.setEditResponsibilities([
      ...editing.editResponsibilities,
      editing.newResponsibility.trim(),
    ]);
    editing.setNewResponsibility("");
  }

  return (
    <div className="space-y-1.5 p-2 rounded border border-dashed border-white/50 bg-white/10">
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">
        Responsibilities
      </div>
      <div className="space-y-1">
        {editing.editResponsibilities.map((r, i) => (
          <div key={i} className="flex items-center gap-1">
            <GripVertical className="h-3 w-3 text-white/40 shrink-0" />
            <input
              value={r}
              onChange={(e) => updateAt(i, e.target.value)}
              className={whiteInputCls}
            />
            <button
              onClick={() => removeAt(i)}
              className={iconBtnCls}
              aria-label="Remove"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 pt-1 border-t border-white/20">
        <input
          value={editing.newResponsibility}
          onChange={(e) => editing.setNewResponsibility(e.target.value)}
          placeholder="New responsibility…"
          className={whiteInputCls}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
        />
        <button
          onClick={addItem}
          disabled={!editing.newResponsibility.trim()}
          className={iconBtnCls}
          aria-label="Add responsibility"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div className="flex justify-end gap-1 pt-1">
        <button
          onClick={() => editing.handleSaveResponsibilities(sec.id)}
          disabled={editing.isPending}
          className={iconBtnCls}
          aria-label="Save"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => editing.resetAll()}
          className={iconBtnCls}
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Post (unlinked) ─────────────────────────────────────────────────────────

function PostBlock({
  post,
  stats,
  employees,
  isEditing,
  editing,
}: {
  post: Post;
  stats: string[];
  employees: string[];
  isEditing: boolean;
  editing: OrgEditingState;
}) {
  const isEditingThis = editing.editingPost === post.id;

  return (
    <div className="group/post">
      {isEditingThis ? (
        <div className="space-y-1.5">
          <LabeledField label="Post title">
            <input
              value={editing.editPostTitle}
              onChange={(e) => editing.setEditPostTitle(e.target.value)}
              className={whiteInputCls}
            />
          </LabeledField>
          <LabeledField label="VFP">
            <input
              value={editing.editPostVfp}
              onChange={(e) => editing.setEditPostVfp(e.target.value)}
              className={whiteInputCls}
              placeholder="What this post produces"
              maxLength={500}
            />
          </LabeledField>
          <div className="flex justify-end gap-1">
            <button
              onClick={() => editing.handleSavePost(post.id)}
              disabled={editing.isPending || !editing.editPostTitle.trim()}
              className={iconBtnCls}
              aria-label="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => editing.resetAll()}
              className={iconBtnCls}
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-wider flex items-center gap-1">
              <Link2 className="h-2.5 w-2.5 opacity-60" />
              {post.title}
            </div>
            {post.vfp && (
              <div className="text-[10.5px] mt-0.5 italic opacity-80 leading-tight">
                VFP: {post.vfp}
              </div>
            )}
            {employees.length > 0 && (
              <div className="text-[11px] mt-0.5 font-medium">
                {employees.join(", ")}
              </div>
            )}
          </div>
          {isEditing && (
            <div className="flex gap-0.5 opacity-0 group-hover/post:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => editing.startEditPost(post)}
                className={iconBtnCls}
                aria-label="Edit post"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete post "${post.title}"?`)) {
                    editing.handleDeletePost(post.id);
                  }
                }}
                className={iconBtnCls}
                aria-label="Delete post"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {stats.length > 0 && !isEditingThis && (
        <div className="mt-1.5 pl-3 border-l border-white/15">
          <div className="text-[9px] font-bold uppercase tracking-widest opacity-70">
            Stats
          </div>
          <ul className="mt-0.5 space-y-0.5">
            {stats.map((s) => (
              <li key={s} className="text-[10.5px] leading-snug opacity-90">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
