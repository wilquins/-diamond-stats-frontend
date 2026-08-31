import React, { useState, useEffect } from "react";

const BACKEND_URL = "https://diamond-stats-backend.onrender.com";

// ---- Semana de la semana de juegos ----
function GamesWeek() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando"); // "cargando" | "listo" | "error"

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/nfl/games`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setData(d); setStatus("listo"); } })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  if (status === "cargando") return <p className="text-[11px]" style={{ color: "#8FA599" }}>Buscando juegos de la semana…</p>;
  if (status === "error") return <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>;
  if (!data || data.games.length === 0) return <p className="text-[11px]" style={{ color: "#8FA599" }}>No hay juegos programados por ahora.</p>;

  return (
    <div className="mb-6">
      <div className="text-[11px] tracking-widest uppercase mb-3" style={{ color: "#8FA599" }}>
        {data.week ? `Semana ${data.week}` : "Juegos"}
      </div>
      <div className="flex flex-col gap-2.5">
        {data.games.map((g) => (
          <div key={g.id} className="p-4 rounded-xl border" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] tracking-widest uppercase" style={{ color: "#8FA599" }}>
                {new Date(g.date).toLocaleDateString("es", { weekday: "short", month: "short", day: "numeric" })} · {new Date(g.date).toLocaleTimeString("es", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: g.completed ? "#1A362A" : "#12281E", color: g.completed ? "#3FC97A" : "#8FA599" }}>
                {g.status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: g.completed && g.awayScore > g.homeScore ? "#FFB627" : "#EDEAE1" }}>{g.awayName}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, monospace" }}>{g.awayScore ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: g.completed && g.homeScore > g.awayScore ? "#FFB627" : "#EDEAE1" }}>{g.homeName}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, monospace" }}>{g.homeScore ?? "—"}</span>
            </div>
            {g.venue && <div className="text-[10px] mt-1" style={{ color: "#5A7368" }}>{g.venue}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Tabla de posiciones ----
function Standings() {
  const [teams, setTeams] = useState(null);
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/nfl/standings`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setTeams(d.teams || []); setStatus("listo"); } })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  if (status === "cargando") return <p className="text-[11px]" style={{ color: "#8FA599" }}>Consultando tabla de posiciones real…</p>;
  if (status === "error") return <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>;

  const afc = teams.filter((t) => t.conference === "AFC");
  const nfc = teams.filter((t) => t.conference === "NFC");

  const renderTable = (list, label) => (
    <div className="mb-6">
      <div className="text-[11px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>{label}</div>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#1F3D30" }}>
        {list.map((t, i) => (
          <div
            key={t.code}
            className="flex items-center justify-between px-3 py-2 text-[11px]"
            style={{ background: i % 2 === 0 ? "#0F251C" : "#12281E", borderTop: i > 0 ? "1px solid #1F3D30" : "none" }}
          >
            <span style={{ color: "#EDEAE1" }}>{t.name}</span>
            <span className="tabular-nums" style={{ color: "#8FA599", fontFamily: "ui-monospace, monospace" }}>
              {t.wins}-{t.losses}{t.ties > 0 ? `-${t.ties}` : ""} · {(t.winPercent * 100).toFixed(1)}% · {t.streak || "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {renderTable(afc, "Conferencia Americana (AFC)")}
      {renderTable(nfc, "Conferencia Nacional (NFC)")}
      <p className="text-[10px] leading-relaxed" style={{ color: "#5A7368" }}>
        Récord real, diferencial de puntos, y racha actual — vía la API pública de ESPN. Ordenado por porcentaje de victorias.
      </p>
    </div>
  );
}

export default function DiamondStatsNFL({ onBackToMenu }) {
  const [view, setView] = useState("juegos"); // "juegos" | "posiciones"

  return (
    <div className="min-h-screen w-full" style={{ background: "#0B1F17" }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: "#C8393E" }} />
            <span className="text-[11px] tracking-[0.25em] uppercase" style={{ color: "#8FA599", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
              NFL Analytics — Fase 1
            </span>
            {onBackToMenu && (
              <button
                onClick={onBackToMenu}
                className="ml-auto text-[10px] font-semibold px-2 py-1 rounded-full"
                style={{ background: "#12281E", color: "#8FA599", border: "1px solid #1F3D30" }}
              >
                ← Elegir otro deporte
              </button>
            )}
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif", letterSpacing: "-0.02em" }}>
            DIAMOND<span style={{ color: "#FFB627" }}>STATS</span>
          </h1>
          <div className="mt-2 h-px w-full" style={{ background: "repeating-linear-gradient(90deg, #C8393E 0 10px, transparent 10px 20px)" }} />
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView("juegos")}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: view === "juegos" ? "#FFB627" : "#12281E",
              color: view === "juegos" ? "#0B1F17" : "#8FA599",
              border: "1px solid " + (view === "juegos" ? "#FFB627" : "#1F3D30"),
            }}
          >
            Juegos de la semana
          </button>
          <button
            onClick={() => setView("posiciones")}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: view === "posiciones" ? "#FFB627" : "#12281E",
              color: view === "posiciones" ? "#0B1F17" : "#8FA599",
              border: "1px solid " + (view === "posiciones" ? "#FFB627" : "#1F3D30"),
            }}
          >
            Tabla de posiciones
          </button>
        </div>

        {view === "juegos" ? <GamesWeek /> : <Standings />}

        <p className="text-[10px] mt-8 leading-relaxed" style={{ color: "#5A7368" }}>
          Fase 1: datos reales conectados (calendario, marcadores, tabla de posiciones). El modelo de predicción se construye en las próximas sesiones, igual que se hizo con MLB.
        </p>
      </div>
    </div>
  );
}
