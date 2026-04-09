import type { Division, Post, Department } from "@/lib/types";

export interface OrgData {
  divisions: Division[];
  posts: Post[];
  departments: Department[];
  statsByPost: Record<string, string[]>;
  employeesByPost: Record<string, string[]>;
  employees: { id: string; full_name: string }[];
  currentUserName?: string;
}

export interface OrgViewerProps extends OrgData {
  isAdmin: boolean;
}

