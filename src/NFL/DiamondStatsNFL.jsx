import React, { useState, useEffect } from "react";

const BACKEND_URL = "https://diamond-stats-backend.onrender.com";

// ---- Modelo de predicción — Fase 3 ----
// Mismo principio de Log5 que usamos en MLB, adaptado a NFL.
function log5(pctA, pctB) {
  const denom = pctA + pctB - 2 * pctA * pctB;
  if (denom === 0) return 0.5;
  return (pctA - pctA * pctB) / denom;
}

// Ventaja real de jugar en casa en la NFL — usamos el promedio de los
// ÚLTIMOS 5 años (53.2%), no el histórico viejo (57-60%). Está confirmado
// con evidencia real que esa ventaja se ha reducido mucho desde 2019 —
// usar el número viejo sobreestimaría al local de forma injusta hoy.
const NFL_HOME_ADVANTAGE = 0.032;

// Calcula la probabilidad real de ganar de un partido de NFL, combinando
// 4 factores reales: récord de temporada (Log5), diferencial de puntos
// por juego, diferencial de balón (turnovers — una de las métricas más
// predictivas en NFL, a veces más que el récord), y el historial cara a
// cara real entre estos dos equipos esta temporada (normalmente 0-1
// juegos, 2 solo si son rivales de división).
async function computeNflWinProb(home, away) {
  if (!home || !away) return null;
  const baseProb = log5(home.winPercent ?? 0.5, away.winPercent ?? 0.5);

  const gamesHome = home.wins + home.losses + home.ties;
  const gamesAway = away.wins + away.losses + away.ties;
  const homeDiffPerGame = gamesHome > 0 ? (home.pointsFor - home.pointsAgainst) / gamesHome : 0;
  const awayDiffPerGame = gamesAway > 0 ? (away.pointsFor - away.pointsAgainst) / gamesAway : 0;
  // Cada punto de diferencial promedio de más vale ~2% de probabilidad,
  // con un tope para que un solo partido con marcador exagerado no
  // distorsione todo el cálculo.
  const diffAdj = Math.max(-0.15, Math.min(0.15, (homeDiffPerGame - awayDiffPerGame) * 0.02));

  // Diferencial de balón real, normalizado por juego — un equipo que
  // roba más balones de los que pierde genuinamente gana más de lo que
  // su récord solo sugiere.
  let turnoverAdj = 0;
  const [homeStats, awayStats] = await Promise.all([
    fetch(`${BACKEND_URL}/api/nfl/team/${home.id}/stats`).then((r) => r.json()).catch(() => null),
    fetch(`${BACKEND_URL}/api/nfl/team/${away.id}/stats`).then((r) => r.json()).catch(() => null),
  ]);
  if (homeStats?.turnoverDifferential != null && awayStats?.turnoverDifferential != null && gamesHome > 0 && gamesAway > 0) {
    const homeTOPerGame = homeStats.turnoverDifferential / gamesHome;
    const awayTOPerGame = awayStats.turnoverDifferential / gamesAway;
    turnoverAdj = Math.max(-0.1, Math.min(0.1, (homeTOPerGame - awayTOPerGame) * 0.05));
  }

  // Cara a cara real esta temporada — solo se activa si ya se
  // enfrentaron (normalmente rivales de división más adelante).
  let h2hAdj = 0;
  const h2h = await fetch(`${BACKEND_URL}/api/nfl/headtohead/${home.id}/${away.id}`).then((r) => r.json()).catch(() => null);
  if (h2h && h2h.gamesPlayed > 0) {
    const homeH2hPct = h2h.team1Wins / h2h.gamesPlayed;
    h2hAdj = (homeH2hPct - 0.5) * 0.1;
  }

  const prob = baseProb + NFL_HOME_ADVANTAGE + diffAdj + turnoverAdj + h2hAdj;
  return Math.min(0.92, Math.max(0.08, prob));
}

// ---- Lesiones reales de un equipo, bajo demanda ----
function TeamInjuries({ teamId, teamName }) {
  const [open, setOpen] = useState(false);
  const [injured, setInjured] = useState(null);
  const [status, setStatus] = useState("idle"); // "idle" | "cargando" | "listo" | "error"

  const toggle = () => {
    if (!open && status === "idle") {
      setStatus("cargando");
      fetch(`${BACKEND_URL}/api/nfl/team/${teamId}/injuries`)
        .then((r) => r.json())
        .then((d) => { setInjured(d.injured || []); setStatus("listo"); })
        .catch(() => setStatus("error"));
    }
    setOpen((v) => !v);
  };

  return (
    <div className="mt-1">
      <button
        onClick={toggle}
        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: "#0F251C", color: "#8FA599", border: "1px solid #1F3D30" }}
      >
        {open ? `Ocultar lesiones de ${teamName} ▲` : `Ver lesiones de ${teamName} ▾`}
      </button>
      {open && (
        <div className="mt-1.5">
          {status === "cargando" && <p className="text-[10px]" style={{ color: "#5A7368" }}>Consultando roster real…</p>}
          {status === "error" && <p className="text-[10px]" style={{ color: "#5A7368" }}>No se pudo traer el roster ahora mismo.</p>}
          {status === "listo" && injured.length === 0 && <p className="text-[10px]" style={{ color: "#5A7368" }}>Sin lesiones reportadas en el roster.</p>}
          {status === "listo" && injured.length > 0 && (
            <div className="space-y-1">
              {injured.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] px-2 py-1 rounded" style={{ background: "#0F251C" }}>
                  <span style={{ color: p.position === "QB" ? "#FFB627" : "#C9D6CD", fontWeight: p.position === "QB" ? 700 : 400 }}>
                    {p.name} ({p.position})
                  </span>
                  <span style={{ color: "#8FA599" }}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Semana de la semana de juegos ----
function GamesWeek() {
  const [data, setData] = useState(null);
  const [standingsMap, setStandingsMap] = useState({});
  const [winProbs, setWinProbs] = useState({}); // { [gameId]: homeWinProb }
  const [weatherData, setWeatherData] = useState({}); // { [gameId]: {...} }
  const [status, setStatus] = useState("cargando"); // "cargando" | "listo" | "error"

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${BACKEND_URL}/api/nfl/games`).then((r) => r.json()),
      fetch(`${BACKEND_URL}/api/nfl/standings`).then((r) => r.json()).catch(() => ({ teams: [] })),
    ])
      .then(async ([gamesData, standingsData]) => {
        if (cancelled) return;
        setData(gamesData);
        const map = Object.fromEntries((standingsData.teams || []).map((t) => [t.code, t]));
        setStandingsMap(map);

        // Calcula la probabilidad real de cada partido pendiente — ahora
        // es async (consulta diferencial de balón y cara a cara reales).
        const probEntries = await Promise.all(
          (gamesData.games || [])
            .filter((g) => !g.completed)
            .map(async (g) => [g.id, await computeNflWinProb(map[g.homeCode], map[g.awayCode])])
        );
        if (!cancelled) setWinProbs(Object.fromEntries(probEntries));

        // Clima real del estadio local, para la hora específica del
        // primer saque — solo para partidos pendientes.
        const weatherEntries = await Promise.all(
          (gamesData.games || [])
            .filter((g) => !g.completed)
            .map(async (g) => {
              const w = await fetch(`${BACKEND_URL}/api/nfl/weather/${g.homeCode}?gameTime=${encodeURIComponent(g.date)}`)
                .then((r) => r.json())
                .catch(() => null);
              return [g.id, w];
            })
        );
        if (!cancelled) setWeatherData(Object.fromEntries(weatherEntries));
        setStatus("listo");
      })
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
        {data.games.map((g) => {
          const home = standingsMap[g.homeCode];
          const away = standingsMap[g.awayCode];
          const homeWinProb = !g.completed ? winProbs[g.id] : null;
          return (
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
                <div className="flex items-center gap-2">
                  {homeWinProb != null && <span className="text-[11px] font-semibold tabular-nums" style={{ color: (1 - homeWinProb) >= homeWinProb ? "#FFB627" : "#8FA599", fontFamily: "ui-monospace, monospace" }}>{((1 - homeWinProb) * 100).toFixed(0)}%</span>}
                  <span className="text-sm font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, monospace" }}>{g.awayScore ?? "—"}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: g.completed && g.homeScore > g.awayScore ? "#FFB627" : "#EDEAE1" }}>{g.homeName}</span>
                <div className="flex items-center gap-2">
                  {homeWinProb != null && <span className="text-[11px] font-semibold tabular-nums" style={{ color: homeWinProb >= (1 - homeWinProb) ? "#FFB627" : "#8FA599", fontFamily: "ui-monospace, monospace" }}>{(homeWinProb * 100).toFixed(0)}%</span>}
                  <span className="text-sm font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, monospace" }}>{g.homeScore ?? "—"}</span>
                </div>
              </div>
              {g.venue && <div className="text-[10px] mt-1" style={{ color: "#5A7368" }}>{g.venue}</div>}
              {!g.completed && weatherData[g.id] && (
                weatherData[g.id].roofed ? (
                  <div className="text-[10px] mt-1" style={{ color: "#5A7368" }}>Estadio con techo cerrado — el clima no afecta este juego</div>
                ) : weatherData[g.id].tempF != null ? (
                  <div className="text-[10px] mt-1" style={{ color: "#8FA599" }}>
                    {weatherData[g.id].icon} {weatherData[g.id].tempF.toFixed(0)}°F · {weatherData[g.id].description} · Viento {weatherData[g.id].windMph.toFixed(0)} mph
                  </div>
                ) : null
              )}
              {!g.completed && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {away?.id && <TeamInjuries teamId={away.id} teamName={g.awayName} />}
                  {home?.id && <TeamInjuries teamId={home.id} teamName={g.homeName} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] mt-3 leading-relaxed" style={{ color: "#5A7368" }}>
        Probabilidad real: Log5 con récord de temporada + ventaja de casa (3.2%, el promedio real de los últimos 5 años, no el histórico viejo) + diferencial de puntos por juego + diferencial de balón real (turnovers) + historial cara a cara esta temporada (cuando ya se enfrentaron). No incluye lesiones, clima, ni QB confirmado todavía — eso viene en la próxima fase.
      </p>
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
              NFL Analytics — Fase 3
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
          Fase 3: probabilidad real de ganar con 4 factores (Log5 + ventaja de casa + diferencial de puntos + diferencial de balón + cara a cara). Pendiente para próximas fases: lesiones factoradas en el cálculo (por ahora solo informativas), QB confirmado, clima real, y backtesting — igual que se hizo con MLB.
        </p>
      </div>
    </div>
  );
}
