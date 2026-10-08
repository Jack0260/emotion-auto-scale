import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sentiscale — Sentiment-Aware Cloud Autoscaler" },
      { name: "description", content: "Autoscaler simulation reacting to CPU, memory and live user sentiment trends." },
      { property: "og:title", content: "Sentiscale — Sentiment-Aware Autoscaler" },
      { property: "og:description", content: "Watch workloads scale with CPU, memory and user sentiment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Tick = { t: number; cpu: number; mem: number; sent: number; vol: number; replicas: number };
type Event = { t: number; msg: string; kind: "up" | "down" | "info" };

const POS = ["Love the new release!", "Super fast checkout 🔥", "Telling all my friends", "Best app this year", "Viral on TikTok right now"];
const NEG = ["App is so slow today", "Checkout keeps failing", "Uninstalling.", "Support never replies", "Login broken again"];
const NEU = ["Anyone tried the update?", "Where is the settings page?", "Ok I guess"];

const MIN = 2, MAX = 40;

// Scaling policy: blends infra pressure with sentiment-driven demand forecast
export function decide(cpu: number, mem: number, sent: number, trend: number, vol: number, replicas: number) {
  const infra = Math.max(cpu, mem) / 70; // target 70% utilisation
  // positive buzz + rising volume => anticipate traffic surge; negative trend with high volume => incident, protect capacity
  const buzz = sent > 0.3 && trend > 0 ? 1 + sent * 0.5 * (vol / 100) : 1;
  const incident = sent < -0.3 && vol > 60 ? 1.15 : 1;
  const churn = sent < -0.3 && vol < 40 ? 0.85 : 1; // users leaving -> less load expected
  const desired = Math.round(replicas * infra * buzz * incident * churn);
  return Math.min(MAX, Math.max(MIN, desired));
}

function Index() {
  const [scenario, setScenario] = useState<"viral" | "outage" | "churn" | "calm">("calm");
  const [weight, setWeight] = useState(1);
  const [data, setData] = useState<Tick[]>([{ t: 0, cpu: 45, mem: 50, sent: 0, vol: 30, replicas: 4 }]);
  const [feed, setFeed] = useState<{ text: string; s: number }[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const ref = useRef({ scenario, weight });
  ref.current = { scenario, weight };

  useEffect(() => {
    const id = setInterval(() => {
      setData((prev) => {
        const last = prev[prev.length - 1];
        const { scenario: sc, weight: w } = ref.current;
        const target = { viral: [0.8, 95], outage: [-0.8, 85], churn: [-0.6, 20], calm: [0.1, 30] }[sc];
        const sent = clamp(last.sent + (target[0] - last.sent) * 0.15 + rnd(0.08), -1, 1);
        const vol = clamp(last.vol + (target[1] - last.vol) * 0.15 + rnd(4), 5, 100);
        const demand = 40 + vol * 0.6 * (sc === "churn" ? 0.4 : 1);
        const cpu = clamp((demand * 4) / last.replicas * 6 + rnd(4), 5, 99);
        const mem = clamp(cpu * 0.8 + 10 + rnd(3), 5, 99);
        const trend = sent - last.sent;
        const raw = decide(cpu, mem, sent * w, trend, vol, last.replicas);
        const replicas = last.replicas + Math.sign(raw - last.replicas) * Math.min(4, Math.abs(raw - last.replicas));
        if (replicas !== last.replicas) {
          const why = sent > 0.3 ? "positive buzz surge" : sent < -0.3 ? (vol > 60 ? "negative incident spike" : "churn signal") : "infra pressure";
          setEvents((e) => [{ t: last.t + 1, kind: replicas > last.replicas ? "up" : "down", msg: `${last.replicas} → ${replicas} pods · ${why}` } as Event, ...e].slice(0, 8));
        }
        const pool = sent > 0.3 ? POS : sent < -0.3 ? NEG : NEU;
        const text = pool[Math.floor(Math.random() * pool.length)];
        setFeed((f) => [{ text, s: sent }, ...f].slice(0, 7));
        return [...prev, { t: last.t + 1, cpu, mem, sent, vol, replicas }].slice(-60);
      });
    }, 900);
    return () => clearInterval(id);
  }, []);

  const cur = data[data.length - 1];
  return (
    <main className="min-h-screen bg-background text-foreground p-6 md:p-10 font-mono">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Sentiscale · cluster prod-eu-1</p>
          <h1 className="text-3xl md:text-5xl font-bold mt-2">Sentiment-aware autoscaler</h1>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm">Scales pods on CPU/memory <em>and</em> the mood of your users — anticipating viral surges, protecting capacity during incidents, shrinking on churn.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["calm", "viral", "outage", "churn"] as const).map((s) => (
            <button key={s} onClick={() => setScenario(s)}
              className={`px-4 py-2 rounded border text-sm capitalize transition ${scenario === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>{s}</button>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Replicas" value={cur.replicas} big />
        <Stat label="CPU" value={`${cur.cpu.toFixed(0)}%`} />
        <Stat label="Memory" value={`${cur.mem.toFixed(0)}%`} />
        <Stat label="Sentiment" value={cur.sent.toFixed(2)} tone={cur.sent > 0.2 ? "pos" : cur.sent < -0.2 ? "neg" : undefined} />
        <Stat label="Mention volume" value={cur.vol.toFixed(0)} />
      </section>

      <section className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Panel title="Replicas vs sentiment"><Chart data={data} /></Panel>
          <Panel title="Infra utilisation"><Lines data={data} /></Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Sentiment weight">
            <input type="range" min={0} max={2} step={0.1} value={weight} onChange={(e) => setWeight(+e.target.value)} className="w-full accent-primary" />
            <p className="text-xs text-muted-foreground mt-1">{weight.toFixed(1)}× — 0 = classic CPU-only HPA</p>
          </Panel>
          <Panel title="Live feedback stream">
            <ul className="space-y-2 text-sm">
              {feed.map((f, i) => (
                <li key={i} className="flex gap-2"><span className={f.s > 0.3 ? "text-success" : f.s < -0.3 ? "text-destructive" : "text-muted-foreground"}>●</span>{f.text}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="Scaling decisions">
            <ul className="space-y-1 text-xs">
              {events.length === 0 && <li className="text-muted-foreground">Waiting…</li>}
              {events.map((e, i) => (
                <li key={i} className={e.kind === "up" ? "text-success" : "text-destructive"}>{e.kind === "up" ? "▲" : "▼"} t{e.t} {e.msg}</li>
              ))}
            </ul>
          </Panel>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, big, tone }: { label: string; value: string | number; big?: boolean; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`${big ? "text-4xl text-primary" : "text-2xl"} font-bold mt-1 ${tone === "pos" ? "text-success" : tone === "neg" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-4"><h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{title}</h2>{children}</div>;
}

const W = 600, H = 180;
const x = (i: number, n: number) => (i / Math.max(59, n - 1)) * W;
function path(vals: number[], f: (v: number) => number) {
  return vals.map((v, i) => `${i ? "L" : "M"}${x(i, vals.length).toFixed(1)},${f(v).toFixed(1)}`).join(" ");
}
function Chart({ data }: { data: Tick[] }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="stroke-border" strokeDasharray="4 4" />
      {data.map((d, i) => (
        <rect key={i} x={x(i, data.length)} width={8} y={H / 2 - (d.sent > 0 ? d.sent * 80 : 0)} height={Math.abs(d.sent) * 80}
          className={d.sent > 0 ? "fill-success/40" : "fill-destructive/40"} />
      ))}
      <path d={path(data.map((d) => d.replicas), (v) => H - (v / MAX) * H)} className="stroke-primary fill-none" strokeWidth={3} />
    </svg>
  );
}
function Lines({ data }: { data: Tick[] }) {
  const f = (v: number) => H - (v / 100) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40">
      <line x1={0} x2={W} y1={f(70)} y2={f(70)} className="stroke-border" strokeDasharray="4 4" />
      <path d={path(data.map((d) => d.cpu), f)} className="stroke-primary fill-none" strokeWidth={2} />
      <path d={path(data.map((d) => d.mem), f)} className="stroke-accent-foreground fill-none" strokeWidth={2} strokeDasharray="5 3" />
    </svg>
  );
}
const rnd = (a: number) => (Math.random() - 0.5) * 2 * a;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
