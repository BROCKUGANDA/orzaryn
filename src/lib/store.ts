"use client";
// ORZARYN — client state (zustand): session, view router, agent key memory.
import { create } from "zustand";

export type ViewKey =
  | "home" | "auth" | "onboarding" | "dashboard" | "agents" | "mandates"
  | "providers" | "quotes" | "purchase" | "approvals" | "workorders"
  | "workorder-detail" | "settlements" | "disputes" | "treasury"
  | "reports" | "developers" | "admin";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}
export interface SessionOrg {
  id: string;
  name: string;
  slug: string;
  status: string;
  role: string;
}
export interface SessionState {
  user: SessionUser | null;
  orgs: SessionOrg[];
  activeOrgId: string | null;
  role: string | null;
  permissions: string[];
}

interface AppState {
  view: ViewKey;
  detailId: string | null;
  session: SessionState | null;
  sessionLoaded: boolean;
  /** Agent API key for this browser session (staging convenience; issued via UI). */
  agentKey: string | null;
  providerKey: string | null;
  setView: (v: ViewKey, detailId?: string | null) => void;
  setSession: (s: SessionState | null) => void;
  setAgentKey: (k: string | null) => void;
  setProviderKey: (k: string | null) => void;
}

export const useApp = create<AppState>((set) => ({
  view: "home",
  detailId: null,
  session: null,
  sessionLoaded: false,
  agentKey: null,
  providerKey: null,
  setView: (v, detailId = null) => {
    set({ view: v, detailId });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", v);
      if (detailId) url.searchParams.set("id", detailId);
      else url.searchParams.delete("id");
      window.history.replaceState(null, "", url.toString());
    }
  },
  setSession: (s) => set({ session: s, sessionLoaded: true }),
  setAgentKey: (k) => set({ agentKey: k }),
  setProviderKey: (k) => set({ providerKey: k }),
}));

export function hasPermission(session: SessionState | null, permission: string): boolean {
  if (!session) return false;
  return session.permissions.includes(permission);
}
