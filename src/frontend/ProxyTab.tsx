import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { RefreshCw, Waypoints } from "lucide-react";
import { useTranslation, type TabProps } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Button,
  PanelSearch,
  PanelShell,
  Segmented,
} from "@termix-ssh/plugin-sdk/ui";
import { getState, type ProxyState, type RouteView } from "./api";
import { CertsView } from "./CertsView";
import { RouteEditor } from "./RouteEditor";
import { RoutesView } from "./RoutesView";

type View = "routes" | "certs";
type Filter = "all" | "running" | "problem" | "off";

// A fixed height box, so the panel body inside it can scroll.
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

/** The reverse proxy for one host: its routes, status and certificates. */
export function ProxyTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const hostId = Number(host?.id);
  const [state, setState] = useState<ProxyState | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>("routes");
  const [editing, setEditing] = useState<RouteView | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setState(await getState());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  const mine = useMemo(
    () => (state?.routes ?? []).filter((route) => route.hostId === hostId),
    [state, hostId],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return mine.filter((route) => {
      const up = route.enabled && route.runtime.state === "running";
      const bad = route.enabled && route.runtime.state === "error";
      if (filter === "running" && !up) return false;
      if (filter === "problem" && !bad) return false;
      if (filter === "off" && route.enabled) return false;
      if (!needle) return true;
      return [route.name, route.domain, route.targetHost]
        .concat(route.listenPort ? [String(route.listenPort)] : [])
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [mine, search, filter]);

  if (!host) {
    return (
      <p className="p-4 text-sm text-muted-foreground">{t("tab.noHost")}</p>
    );
  }
  if (failed && !state) {
    return <p className="p-4 text-sm text-destructive">{t("tab.error")}</p>;
  }
  if (!state) return null;

  const info = state.hosts.find((h) => h.id === hostId);
  const allowed = info?.enabled !== false;

  if (editing) {
    return (
      <Frame>
        <RouteEditor
          // A fresh editor per route so old form state never carries over.
          key={editing === "new" ? "new" : editing.id}
          route={editing === "new" ? null : editing}
          hostId={hostId}
          defaultAccess={info?.defaultAccess ?? "none"}
          certs={state.certs}
          onClose={() => setEditing(null)}
          reload={() => void load()}
        />
      </Frame>
    );
  }

  const running = mine.filter(
    (r) => r.enabled && r.runtime.state === "running",
  ).length;
  const ports = state.ports.running;

  return (
    <Frame>
      <PanelShell
        icon={<Waypoints className="size-4" />}
        title={label || info?.name || t("tab.title")}
        status={t("tab.status", { running, total: mine.length })}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void load()}
              disabled={loading}
              title={t("tab.refresh")}
              className="text-accent-brand"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
            <AddButton
              label={t("list.add")}
              onClick={() => setEditing("new")}
              disabled={!allowed}
            />
          </>
        }
        toolbar={
          <>
            <Segmented<View>
              value={view}
              onChange={setView}
              options={[
                { value: "routes", label: t("tab.viewRoutes") },
                { value: "certs", label: t("tab.viewCerts") },
              ]}
            />
            {view === "routes" && (
              <>
                <PanelSearch
                  value={search}
                  onChange={setSearch}
                  placeholder={t("tab.search")}
                />
                <Segmented<Filter>
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: t("tab.filterAll") },
                    { value: "running", label: t("list.state.running") },
                    { value: "problem", label: t("list.state.error") },
                    { value: "off", label: t("list.disabled") },
                  ]}
                />
              </>
            )}
          </>
        }
        className="gap-2 p-2.5"
      >
        <div className="flex shrink-0 flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t("tab.ports", {
              http: ports.http ?? t("tab.notListening"),
              https: ports.https ?? t("tab.notListening"),
            })}
          </p>
          {!allowed && (
            <p className="mb-2 border border-border p-2 text-xs text-muted-foreground">
              {t("tab.hostOff")}
            </p>
          )}
          {state.needsBaseUrl && mine.some((r) => r.authMode !== "none") && (
            <p className="mb-2 border border-border p-2 text-xs text-muted-foreground">
              {t("tab.needsBaseUrl")}
            </p>
          )}
          {view === "routes" ? (
            <RoutesView
              routes={visible}
              onOpen={setEditing}
              reload={() => void load()}
            />
          ) : (
            <CertsView
              certs={state.certs}
              needsEmail={state.needsEmail}
              reload={() => void load()}
            />
          )}
        </div>
      </PanelShell>
    </Frame>
  );
}
