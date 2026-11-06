import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Waypoints } from "lucide-react";
import {
  useTranslation,
  type ExtensionContribution,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { StatusDot, WidgetTitle } from "@termix-ssh/plugin-sdk/ui";
import { getState, type ProxyState } from "./api";

const GRID_SIZE = 30;
const POLL_MS = 60_000;

interface WidgetProps {
  widget: { title?: string | null };
  config: Record<string, never>;
}

/** What app.registerExtension("homepage.widgets", ...) takes. */
interface WidgetDefinition extends ExtensionContribution {
  id: string;
  name: string;
  description: string;
  category: "links" | "info" | "system" | "monitoring";
  icon: ReactNode;
  defaultConfig: Record<string, never>;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  components: { view: ComponentType<WidgetProps> };
}

function ProxyWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<ProxyState | null>(null);

  useEffect(() => {
    const load = () =>
      void getState()
        .then(setState)
        .catch(() => setState(null));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const enabled = (state?.routes ?? []).filter((route) => route.enabled);
  const broken = enabled.filter((route) => route.runtime.state === "error");
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <WidgetTitle title={widget.title} icon={<Waypoints size={11} />} />
      <div
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 text-xs"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {!state ? (
          <p className="text-muted-foreground">{t("card.loading")}</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <StatusDot tone={broken.length > 0 ? "bad" : "ok"} />
              <span>
                {t("card.summary", {
                  running: enabled.length - broken.length,
                  total: enabled.length,
                })}
              </span>
            </div>
            {broken.map((route) => (
              <p key={route.id} className="truncate text-muted-foreground">
                {route.name || route.domain}: {route.runtime.error}
              </p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function proxyWidget(t: TermixApp["t"]): WidgetDefinition {
  return {
    id: "reverse_proxy",
    name: t("widget.name"),
    description: t("widget.description"),
    category: "monitoring",
    icon: <Waypoints size={16} />,
    defaultConfig: {},
    defaultSize: { w: 10 * GRID_SIZE, h: 6 * GRID_SIZE },
    minSize: { w: 6 * GRID_SIZE, h: 4 * GRID_SIZE },
    components: { view: ProxyWidget },
  };
}
