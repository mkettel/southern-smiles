"use client";

import { useMemo } from "react";
import { PanContainer } from "./pan-container";
import type { OrgData } from "./types";
import type { Department, Post } from "@/lib/types";

/**
 * Dense org-chart board view (draw.io style). Each division is a colored
 * vertical column with departments and sections rendered as flat bands — no
 * nested card borders. Everything is visible; navigate via pan/zoom.
 */
export function BoardView({
  divisions,
  posts,
  departments,
  statsByPost,
  employeesByPost,
  currentUserName,
}: OrgData) {
  const { sortedDivisions, deptsByDivision, postsByDivision, linkedPostIds } =
    useMemo(() => {
      const sortedDivisions = [...divisions].sort((a, b) => a.number - b.number);

      const deptsByDivision: Record<string, Department[]> = {};
      for (const dept of departments) {
        (deptsByDivision[dept.division_id] ??= []).push(dept);
      }
      for (const list of Object.values(deptsByDivision)) {
        list.sort((a, b) => a.display_order - b.display_order);
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

      return { sortedDivisions, deptsByDivision, postsByDivision, linkedPostIds };
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
      </p>

      <PanContainer className="border rounded-lg bg-background h-[calc(100vh-240px)] min-h-[500px]">
        <div
          data-pan-handle
          className="flex gap-2 p-4 min-w-max min-h-full items-stretch"
        >
          {sortedDivisions.map((div) => {
            const color = div.color || "#6b7280";
            const divDepts = deptsByDivision[div.id] ?? [];
            const divPosts = postsByDivision[div.id] ?? [];
            const unlinkedPosts = divPosts.filter((p) => !linkedPostIds.has(p.id));
            const isCurrentUserDiv =
              !!currentUserName && div.executive === currentUserName;

            return (
              <div
                key={div.id}
                className="w-80 shrink-0 flex flex-col text-white rounded-lg overflow-hidden shadow-sm"
                style={{ backgroundColor: color }}
              >
                {/* Division header — fixed height so columns align across the board */}
                <div
                  className="h-24 px-3 py-2.5 border-b-2 border-white/30 flex flex-col items-center justify-center text-center"
                  style={{
                    boxShadow: isCurrentUserDiv
                      ? "inset 0 0 0 3px rgba(255,255,255,0.7)"
                      : undefined,
                  }}
                >
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
                </div>

                {/* Body: airy whitespace between departments; indent carries hierarchy */}
                <div className="flex-1 bg-white/5 px-3 py-4 space-y-5">
                  {divDepts.map((dept) => (
                    <DepartmentBlock
                      key={dept.id}
                      dept={dept}
                      postsById={postsById}
                      statsByPost={statsByPost}
                      employeesByPost={employeesByPost}
                    />
                  ))}

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
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {divDepts.length === 0 && unlinkedPosts.length === 0 && (
                    <p className="text-[11px] text-center py-6 opacity-70 italic">
                      No departments yet
                    </p>
                  )}
                </div>

                {/* VFP footer stays pinned at column bottom */}
                {div.vfp && (
                  <div className="px-3 py-2.5 border-t border-white/25 bg-black/25">
                    <div className="text-[9px] font-bold uppercase tracking-widest opacity-80 mb-0.5">
                      VFP
                    </div>
                    <p className="text-[11px] leading-snug">{div.vfp}</p>
                  </div>
                )}
              </div>
            );
          })}

          {sortedDivisions.length === 0 && (
            <div className="flex items-center justify-center w-full text-white/60 text-sm py-12">
              No divisions defined yet.
            </div>
          )}
        </div>
      </PanContainer>
    </div>
  );
}

function DepartmentBlock({
  dept,
  postsById,
  statsByPost,
  employeesByPost,
}: {
  dept: Department;
  postsById: Map<string, Post>;
  statsByPost: Record<string, string[]>;
  employeesByPost: Record<string, string[]>;
}) {
  const sections = [...(dept.sections ?? [])].sort(
    (a, b) => a.display_order - b.display_order
  );

  return (
    <div>
      {/* Dept name — largest in the column body, flush left */}
      <div className="text-[13px] font-bold leading-tight">{dept.name}</div>
      {dept.director && (
        <div className="text-[11px] opacity-80 mt-0.5">
          Director · <span className="font-medium opacity-100">{dept.director}</span>
        </div>
      )}

      {/* Sections indented under dept, tied together by a left rule */}
      {sections.length > 0 && (
        <div className="mt-2 pl-3 border-l border-white/30 space-y-3">
          {sections.map((sec) => {
            const linkedPost = sec.post_id ? postsById.get(sec.post_id) : null;
            const postStats = linkedPost ? statsByPost[linkedPost.id] ?? [] : [];
            const postEmployees = linkedPost
              ? employeesByPost[linkedPost.id] ?? []
              : [];
            const assignee =
              sec.assignee ??
              (postEmployees.length > 0 ? postEmployees.join(", ") : null);

            return (
              <div key={sec.id}>
                {/* Section header — all caps, tighter than dept */}
                <div className="text-[10.5px] font-bold uppercase tracking-wider">
                  {sec.name} Section
                </div>

                {/* Role line — italic role, name after */}
                {(linkedPost?.title || assignee) && (
                  <div className="text-[11px] mt-0.5">
                    {linkedPost?.title && (
                      <span className="italic opacity-90">{linkedPost.title}</span>
                    )}
                    {assignee && (
                      <span className="font-medium">
                        {linkedPost?.title ? " · " : ""}
                        {assignee}
                      </span>
                    )}
                  </div>
                )}

                {/* Responsibilities + stats indented once more under section */}
                {(sec.responsibilities.length > 0 || postStats.length > 0) && (
                  <div className="mt-1.5 pl-3 border-l border-white/15 space-y-1.5">
                    {sec.responsibilities.length > 0 && (
                      <ul className="space-y-0.5">
                        {sec.responsibilities.map((r, i) => (
                          <li
                            key={i}
                            className="text-[10.5px] leading-snug opacity-80"
                          >
                            {r}
                          </li>
                        ))}
                      </ul>
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sections.length === 0 && (
        <div className="mt-1.5 text-[10px] italic opacity-60">No sections</div>
      )}
    </div>
  );
}

function PostBlock({
  post,
  stats,
  employees,
}: {
  post: Post;
  stats: string[];
  employees: string[];
}) {
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-wider">
        {post.title}
      </div>
      {employees.length > 0 && (
        <div className="text-[11px] mt-0.5 font-medium">
          {employees.join(", ")}
        </div>
      )}
      {stats.length > 0 && (
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
