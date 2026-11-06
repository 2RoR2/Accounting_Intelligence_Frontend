import type { User } from "@/types";
import { api } from "./client";

export type WorkspaceModule = {
  key: string;
  section: string;
  label: string;
  route: string;
  icon: string;
  order: number;
};

export function getWorkspaceNavigation(_user: User) {
  void _user;
  return api<WorkspaceModule[]>("/api/workspace/navigation");
}
