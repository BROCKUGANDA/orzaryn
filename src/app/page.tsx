"use client";
// ORZARYN — application shell & internal view router (ADR-008).
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LogoHorizontal } from "@/components/brand/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { orzFetch } from "@/lib/client";
import { useApp, hasPermission, type ViewKey, type SessionState } from "@/lib/store";
import { HomeView, AuthView, OnboardingView } from "@/components/views/public-views";
import { DashboardView, AgentsView, MandatesView, ProvidersView } from "@/components/views/workspace-views-1";
import { QuotesView, PurchaseView, ApprovalsView, WorkOrdersView, WorkOrderDetailView } from "@/components/views/workspace-views-2";
import { SettlementsView, DisputesView, TreasuryView, ReportsView, DevelopersView, AdminView } from "@/components/views/workspace-views-3";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const NAV: { key: ViewKey; label: string; permission?: string }[] = [
  { key: "dashboard", label: "Overview" },
  { key: "agents", label: "Agents" },
  { key: "mandates", label: "Mandates", permission: "mandates.manage" },
  { key: "providers", label: "Providers" },
  { key: "quotes", label: "Marketplace" },
  { key: "purchase", label: "Purchase" },
  { key: "approvals", label: "Approvals" },
  { key: "workorders", label: "Work orders" },
  { key: "settlements", label: "Settlements" },
  { key: "disputes", label: "Disputes" },
  { key: "treasury", label: "Treasury" },
  { key: "reports", label: "Reports" },
  { key: "developers", label: "Developers" },
  { key: "admin", label: "Admin", permission: "org.manage" },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { view, setView, session } = useApp();
  const approvals = queryClient.getQueryData<{ pending: unknown[] }>(["approvals"]);
  const pendingCount = approvals?.pending.length ?? 0;
  return (
    <nav aria-label="Workspace" className="flex flex-col gap-0.5">
      {NAV.filter((n) => !n.permission || hasPermission(session, n.permission)).map((n) => (
        <button
          key={n.key}
          onClick={() => {
            setView(n.key);
            onNavigate?.();
          }}
          aria-current={view === n.key ? "page" : undefined}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
            view === n.key || (view === "workorder-detail" && n.key === "workorders")
              ? "bg-secondary font-medium text-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          }`}
        >
          {n.label}
          {n.key === "approvals" && pendingCount > 0 ? (
            <span className="orz-breathe rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "var(--orz-amber-bg)", color: "var(--orz-amber)" }}>
              {pendingCount}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { session, setSession, setView, view } = useApp();
  const org = session?.orgs?.find((o) => o.id === session.activeOrgId);

  async function logout() {
    await orzFetch("/api/auth/logout", { body: {} }).catch(() => {});
    setSession(null);
    setView("home");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64">
                <SheetTitle>
                  <LogoHorizontal size={22} />
                </SheetTitle>
                <div className="mt-4">
                  <SidebarNav onNavigate={() => undefined} />
                </div>
              </SheetContent>
            </Sheet>
            <LogoHorizontal size={24} />
            <span className="hidden text-sm text-muted-foreground sm:inline">/ {org?.name ?? "no organisation"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">{session?.user?.email}</span>
            <Button size="sm" variant="ghost" onClick={logout}>Sign out</Button>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 border-r border-border p-3 md:block">
          <SidebarNav />
        </aside>
        <main className="min-w-0 flex-1 p-4 pb-16 sm:p-6">{children}</main>
      </div>
      <footer className="mt-auto border-t border-border px-4 py-3 text-center text-xs text-muted-foreground" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        ORZARYN · staging · testnet USDC only · all DEMO chain references are simulations
      </footer>
    </div>
  );
}

function CurrentView() {
  const { view, detailId } = useApp();
  switch (view) {
    case "dashboard": return <DashboardView />;
    case "agents": return <AgentsView />;
    case "mandates": return <MandatesView />;
    case "providers": return <ProvidersView />;
    case "quotes": return <QuotesView />;
    case "purchase": return <PurchaseView />;
    case "approvals": return <ApprovalsView />;
    case "workorders": return <WorkOrdersView />;
    case "workorder-detail": return detailId ? <WorkOrderDetailView publicId={detailId} /> : <WorkOrdersView />;
    case "settlements": return <SettlementsView />;
    case "disputes": return <DisputesView />;
    case "treasury": return <TreasuryView />;
    case "reports": return <ReportsView />;
    case "developers": return <DevelopersView />;
    case "admin": return <AdminView />;
    case "onboarding": return <OnboardingView />;
    case "auth": return <AuthView />;
    default: return <HomeView />;
  }
}

export default function Page() {
  const { session, sessionLoaded, setSession, view, setView } = useApp();

  useEffect(() => {
    // deep-link restore: /?view=…&id=…
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view") as ViewKey | null;
    const id = params.get("id");
    if (v) setView(v, id);
    // session bootstrap
    orzFetch<SessionState>("/api/auth/me")
      .then((me) => {
        setSession(me.user ? me : null);
        if (me.user && !v) setView(me.activeOrgId ? "dashboard" : "onboarding");
      })
      .catch(() => setSession(null));
  }, []);

  const workspaceReady = sessionLoaded && session?.user && session.activeOrgId;
  const authedNoOrg = sessionLoaded && session?.user && !session.activeOrgId;

  const isPublicView = view === "home" || view === "auth";
  const isStandaloneView = view === "developers" || view === "onboarding";

  let content: React.ReactNode;
  if (workspaceReady) {
    content = (
      <AppShell>
        <CurrentView />
      </AppShell>
    );
  } else if (authedNoOrg) {
    content = <OnboardingView />;
  } else if (view === "auth" || (!sessionLoaded && !isPublicView)) {
    content = <AuthView />;
  } else if (isPublicView) {
    content = <HomeView />;
  } else if (isStandaloneView) {
    content = (
      <div className="min-h-screen">
        <header className="border-b border-border px-4 py-3">
          <button onClick={() => setView("home")} aria-label="ORZARYN home"><LogoHorizontal size={22} /></button>
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6">
          <CurrentView />
        </main>
      </div>
    );
  } else {
    content = <HomeView />;
  }

  return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>;
}
