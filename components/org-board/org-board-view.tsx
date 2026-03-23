"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, User, Target, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrgDivision, OrgDepartment, OrgSection } from "@/lib/org-board-data";

interface OrgBoardViewProps {
  data: OrgDivision[];
}

function SectionCard({ section }: { section: OrgSection }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border bg-background p-2.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-start justify-between gap-2"
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium leading-tight">{section.name}</p>
          {section.assignee && (
            <div className="flex items-center gap-1 mt-1">
              <User className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                {section.assignee}
              </span>
            </div>
          )}
        </div>
        {section.responsibilities.length > 0 && (
          <span className="text-muted-foreground shrink-0">
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        )}
      </button>
      {expanded && section.responsibilities.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t pt-2">
          {section.responsibilities.map((r, i) => (
            <li key={i} className="text-[10px] text-muted-foreground leading-tight pl-2">
              &bull; {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DepartmentBlock({ dept }: { dept: OrgDepartment }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border bg-muted/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">{dept.name}</p>
          {dept.director && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Director: {dept.director}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
            {dept.sections.length}
          </Badge>
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-1.5">
          {dept.sections.map((section, i) => (
            <SectionCard key={i} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}

function DivisionColumn({ division }: { division: OrgDivision }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="overflow-hidden h-fit">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
        style={{ backgroundColor: division.color + "15" }}
      >
        <div
          className="px-4 py-3 border-b"
          style={{ borderBottomColor: division.color + "30" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: division.color }}
                />
                <h3 className="font-bold text-sm">
                  Div {division.number} – {division.name}
                </h3>
              </div>
              {division.executive && (
                <p className="text-xs text-muted-foreground mt-1 ml-[18px]">
                  {division.executive}
                </p>
              )}
            </div>
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <CardContent className="p-3 space-y-3">
          {/* VFP */}
          {division.vfp && (
            <div className="flex items-start gap-1.5 px-1">
              <Target className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[10px] text-muted-foreground italic leading-tight">
                VFP: {division.vfp}
              </p>
            </div>
          )}

          {/* Stats */}
          {division.stats && division.stats.length > 0 && (
            <div className="flex items-start gap-1.5 px-1">
              <BarChart3 className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {division.stats.map((s, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-[9px] px-1.5 py-0"
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Departments */}
          <div className="space-y-2">
            {division.departments.map((dept, i) => (
              <DepartmentBlock key={i} dept={dept} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function OrgBoardView({ data }: OrgBoardViewProps) {
  const [collapseAll, setCollapseAll] = useState(false);

  // Sort by division number, but put 7 (Executive) first
  const sorted = [...data].sort((a, b) => {
    if (a.number === 7) return -1;
    if (b.number === 7) return 1;
    return a.number - b.number;
  });

  return (
    <div className="space-y-4">
      {/* Executive division spans full width */}
      {sorted.filter((d) => d.number === 7).map((div) => (
        <DivisionColumn key={div.number} division={div} />
      ))}

      {/* Other divisions in a responsive grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.filter((d) => d.number !== 7).map((div) => (
          <DivisionColumn key={div.number} division={div} />
        ))}
      </div>
    </div>
  );
}
