import React, { useState, useEffect } from "react";

const BACKEND_URL = "https://diamond-stats-backend.onrender.com";

// ---- Modelo de predicción — NHL Fase 1 ----
// Mismo principio de Log5 que ya usamos en MLB y NFL.
function log5(pctA, pctB) {
  const denom = pctA + pctB - 2 * pctA * pctB;
  if (denom === 0) return 0.5;
  return (pctA - pctA * pctB) / denom;
}

// Ventaja real de jugar en casa en la NHL — fuente real: puntos% de local
// (.585) vs. visitante (.524) en las temporadas 2021-22 a 2023-24
// (https://soundofhockey.com/2025/02/02/is-there-really-a-home-ice-advantage-in-the-nhl/).
// Se usa un ajuste moderado (3%) en línea con esa diferencia real, no un
// número inventado.
const NHL_HOME_ADVANTAGE = 0.03;

// El % de puntos (pointPctg) es la medida real de fuerza en NHL — a
// diferencia de MLB/NFL, una derrota en tiempo extra o shootout vale
// medio punto, no cero, así que el simple wins/(wins+losses) subestima a
// los equipos que pierden mucho en OT. Convertimos cualquier récord
// casa/ruta/últimos-10 al mismo criterio real (W + 0.5×OTL) / jugados.
function pointsPct(w, l, otl) {
  const played = (w ?? 0) + (l ?? 0) + (otl ?? 0);
  if (played === 0) return null;
  return ((w ?? 0) + (otl ?? 0) * 0.5) / played;
}

// Calcula la probabilidad real de ganar de un partido de NHL: récord real
// (Log5 sobre % de puntos) + ventaja de casa + forma reciente real
// (últimos 10) + récord real de casa del local vs. ruta del visitante +
// fuerza real de calendario (de qué tan duros han sido los rivales que ya
// enfrentó cada equipo esta temporada de referencia).
//
// Lo que falta todavía (fase 2, pendiente): portero titular real — en
// hockey es probablemente el factor individual más grande, igual que el
// abridor en MLB — y Over/Under. No se adivina ninguno de los dos: se
// omiten por ahora en vez de rellenarlos con un número inventado.
async function computeNhlWinProb(home, away) {
  if (!home || !away) return null;

  const homeStrength = home.pointPctg ?? 0.5;
  const awayStrength = away.pointPctg ?? 0.5;
  const baseProb = log5(homeStrength, awayStrength);

  const homeL10 = pointsPct(home.l10Wins, home.l10Losses, home.l10OtLosses);
  const awayL10 = pointsPct(away.l10Wins, away.l10Losses, away.l10OtLosses);
  const formAdj = homeL10 != null && awayL10 != null ? (homeL10 - awayL10) * 0.15 : 0;

  const homeHomePct = pointsPct(home.homeWins, home.homeLosses, home.homeOtLosses);
  const awayRoadPct = pointsPct(away.roadWins, away.roadLosses, away.roadOtLosses);
  let homeRoadAdj = 0;
  if (homeHomePct != null && awayRoadPct != null) {
    homeRoadAdj = ((homeHomePct - homeStrength) - (awayRoadPct - awayStrength)) * 0.5;
  }

  const [homeSchedule, awaySchedule] = await Promise.all([
    fetch(`${BACKEND_URL}/api/nhl/team/${home.code}/schedule-analysis`).then((r) => r.json()).catch(() => null),
    fetch(`${BACKEND_URL}/api/nhl/team/${away.code}/schedule-analysis`).then((r) => r.json()).catch(() => null),
  ]);
  let sosAdj = 0;
  if (homeSchedule?.avgOpponentWinPct != null && awaySchedule?.avgOpponentWinPct != null) {
    sosAdj = (homeSchedule.avgOpponentWinPct - awaySchedule.avgOpponentWinPct) * 0.3;
  }

  const prob = Math.min(0.92, Math.max(0.08, baseProb + NHL_HOME_ADVANTAGE + formAdj + homeRoadAdj + sosAdj));
  return { prob, formAdj, homeRoadAdj, sosAdj, homeSchedule, awaySchedule };
}

// ---- Lista de juegos de hoy ----
function GamesList({ onSelect }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/nhl/games`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setData(d); setStatus("listo"); } })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  if (status === "cargando") return <p className="text-[11px]" style={{ color: "#8FA599" }}>Buscando juegos de hoy…</p>;
  if (status === "error") return <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>;
  if (!data || data.games.length === 0) return <p className="text-[11px]" style={{ color: "#8FA599" }}>No hay juegos programados hoy.</p>;

  return (
    <div className="mb-6">
      <div className="text-[11px] tracking-widest uppercase mb-3" style={{ color: "#8FA599" }}>
        Juegos de hoy
      </div>
      <div className="flex flex-col gap-2">
        {data.games.map((g) => (
          <button
            key={g.id}
            onClick={() => onSelect(g)}
            className="w-full text-left p-3.5 rounded-xl border transition-transform hover:scale-[1.01]"
            style={{ background: "#0F251C", borderColor: "#1F3D30" }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] tracking-widest uppercase" style={{ color: "#8FA599" }}>
                {new Date(g.startTimeUTC).toLocaleTimeString("es", { hour: "numeric", minute: "2-digit", hour12: true })}
                {g.venue ? ` · ${g.venue}` : ""}
              </span>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: g.isPreseason ? "#3D2A12" : g.gameState === "OFF" ? "#1A362A" : "#12281E",
                  color: g.isPreseason ? "#FFB627" : g.gameState === "OFF" ? "#3FC97A" : "#8FA599",
                }}
              >
                {g.isPreseason ? "Pretemporada" : g.gameState === "OFF" ? "Final" : g.gameState === "LIVE" ? "En vivo" : "Programado"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: g.gameState === "OFF" && g.awayScore > g.homeScore ? "#FFB627" : "#EDEAE1" }}>{g.awayName}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, monospace" }}>{g.awayScore ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: g.gameState === "OFF" && g.homeScore > g.awayScore ? "#FFB627" : "#EDEAE1" }}>{g.homeName}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, monospace" }}>{g.homeScore ?? "—"}</span>
            </div>
            {g.isPreseason && (
              <div className="text-[10px] mt-1.5" style={{ color: "#FFB627" }}>
                Juego de pretemporada — suelen jugar suplentes y prospectos, así que el resultado no refleja la fuerza real del equipo titular.
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Detalle completo de un partido ----
function GameDetail({ game, onBack }) {
  const [teams, setTeams] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    setStatus("cargando");
    (async () => {
      const standingsData = await fetch(`${BACKEND_URL}/api/nhl/standings`).then((r) => r.json()).catch(() => ({ teams: [] }));
      if (cancelled) return;
      const map = Object.fromEntries((standingsData.teams || []).map((t) => [t.code, t]));
      const home = map[game.homeCode];
      const away = map[game.awayCode];
      setTeams({ home, away });
      if (home && away) {
        const r = await computeNhlWinProb(home, away);
        if (!cancelled) { setResult(r); setStatus("listo"); }
      } else if (!cancelled) {
        setStatus("listo");
      }
    })();
    return () => { cancelled = true; };
  }, [game.homeCode, game.awayCode]);

  return (
    <div className="mb-6">
      <button
        onClick={onBack}
        className="text-[11px] font-semibold mb-3 flex items-center gap-1"
        style={{ color: "#FFB627" }}
      >
        ← Volver a juegos de hoy
      </button>

      <div className="p-4 rounded-xl border" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
        <div className="text-sm font-bold mb-1" style={{ color: "#EDEAE1" }}>{game.awayName} @ {game.homeName}</div>
        {game.venue && <div className="text-[11px] mb-3" style={{ color: "#8FA599" }}>{game.venue}</div>}

        {game.isPreseason && (
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#3D2A12", borderColor: "#5A3D1A" }}>
            <p className="text-[11px]" style={{ color: "#FFB627" }}>
              Juego de pretemporada — muchos titulares no juegan o juegan pocos minutos, así que la probabilidad de abajo (basada en el récord real de la temporada de referencia) es mucho menos confiable que en temporada regular. Úsala con cautela.
            </p>
          </div>
        )}

        {status === "cargando" && (
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <p className="text-[11px]" style={{ color: "#8FA599" }}>Calculando probabilidad real (récord, forma reciente, casa/ruta, fuerza de calendario)…</p>
          </div>
        )}

        {status === "listo" && !result && (
          <p className="text-[11px]" style={{ color: "#8FA599" }}>No hay récord real todavía para uno de los dos equipos.</p>
        )}

        {status === "listo" && result && teams && (() => {
          const homeWinProb = result.prob;
          const awayWinProb = 1 - homeWinProb;
          const oppDivForAway = teams.home?.divisionName;
          const oppDivForHome = teams.away?.divisionName;
          const vsDivAway = oppDivForAway ? result.awaySchedule?.recordByDivision?.[oppDivForAway] : null;
          const vsDivHome = oppDivForHome ? result.homeSchedule?.recordByDivision?.[oppDivForHome] : null;
          return (
            <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
                Probabilidad de ganar (Log5 sobre % de puntos real + ventaja de casa + forma reciente + récord casa/ruta + fuerza real de calendario)
              </div>
              {(result.homeSchedule?.avgOpponentWinPct != null || result.awaySchedule?.avgOpponentWinPct != null) && (
                <p className="text-[10px] mb-2" style={{ color: "#5A7368" }}>
                  Fuerza de calendario real: {game.awayName} enfrentó rivales con {result.awaySchedule?.avgOpponentWinPct != null ? `${(result.awaySchedule.avgOpponentWinPct * 100).toFixed(1)}%` : "—"} de % de puntos promedio · {game.homeName} enfrentó rivales con {result.homeSchedule?.avgOpponentWinPct != null ? `${(result.homeSchedule.avgOpponentWinPct * 100).toFixed(1)}%` : "—"} de % de puntos promedio.
                </p>
              )}
              <div className="space-y-2.5 mb-1">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span style={{ color: awayWinProb >= homeWinProb ? "#FFB627" : "#C9D6CD" }}>{game.awayName}</span>
                    <span className="font-bold tabular-nums" style={{ color: awayWinProb >= homeWinProb ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{(awayWinProb * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full" style={{ background: "#1A362A" }}>
                    <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${(awayWinProb * 100).toFixed(1)}%`, background: awayWinProb >= homeWinProb ? "#FFB627" : "#5A7368" }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span style={{ color: homeWinProb > awayWinProb ? "#FFB627" : "#C9D6CD" }}>{game.homeName}</span>
                    <span className="font-bold tabular-nums" style={{ color: homeWinProb > awayWinProb ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{(homeWinProb * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full" style={{ background: "#1A362A" }}>
                    <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${(homeWinProb * 100).toFixed(1)}%`, background: homeWinProb > awayWinProb ? "#FFB627" : "#5A7368" }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {teams?.home && teams?.away && (
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Récord real esta temporada de referencia</div>
            <div className="grid grid-cols-2 gap-3 text-[11px]" style={{ color: "#8FA599" }}>
              {[{ code: game.awayCode, name: game.awayName, tag: "Visitante", team: teams.away, isHome: false },
                { code: game.homeCode, name: game.homeName, tag: "Local", team: teams.home, isHome: true }].map(({ code, name, tag, team, isHome }) => {
                const analysis = isHome ? result?.homeSchedule : result?.awaySchedule;
                const opponentDivision = isHome ? teams.away?.divisionName : teams.home?.divisionName;
                const vsDiv = opponentDivision ? analysis?.recordByDivision?.[opponentDivision] : null;
                const isInter = team?.conferenceName && (isHome ? teams.away?.conferenceName : teams.home?.conferenceName) && team.conferenceName !== (isHome ? teams.away.conferenceName : teams.home.conferenceName);
                return (
                  <div key={code}>
                    <div className="font-semibold mb-1" style={{ color: "#EDEAE1" }}>{code} · {tag}</div>
                    <div>{team?.wins}-{team?.losses}-{team?.otLosses} · <b style={{ color: "#FFB627" }}>{team?.pointPctg != null ? `${(team.pointPctg * 100).toFixed(1)}%` : "—"} pts</b></div>
                    <div>{isHome ? "En casa" : "En ruta"}: <b style={{ color: "#C9D6CD" }}>{isHome ? `${team?.homeWins}-${team?.homeLosses}-${team?.homeOtLosses}` : `${team?.roadWins}-${team?.roadLosses}-${team?.roadOtLosses}`}</b></div>
                    <div>Últimos 10: <b style={{ color: "#FFB627" }}>{team?.l10Wins}-{team?.l10Losses}-{team?.l10OtLosses}</b></div>
                    <div>Racha: <b style={{ color: "#C9D6CD" }}>{team?.streakCode ? `${team.streakCode}${team.streakCount}` : "—"}</b></div>
                    <div>Vs {opponentDivision || "división del rival"}{isInter ? " (interconferencia)" : ""}: <b style={{ color: "#FFB627" }}>{vsDiv ? `${vsDiv.w}-${vsDiv.l}` : "—"}</b></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-[10px] leading-relaxed" style={{ color: "#5A7368" }}>
          Todavía no incluye portero titular real (probablemente el factor más grande en hockey) ni Over/Under — llegan en la siguiente fase, con los mismos datos reales de la API oficial de NHL.
        </p>
      </div>
    </div>
  );
}

// ---- Tabla de posiciones real ----
function Standings() {
  const [teams, setTeams] = useState(null);
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/nhl/standings`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setTeams(d.teams || []); setStatus("listo"); } })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  if (status === "cargando") return <p className="text-[11px]" style={{ color: "#8FA599" }}>Consultando tabla de posiciones real…</p>;
  if (status === "error") return <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>;

  const east = teams.filter((t) => t.conferenceName === "Eastern");
  const west = teams.filter((t) => t.conferenceName === "Western");

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
            <span style={{ color: "#EDEAE1" }}>{t.name} <span style={{ color: "#5A7368" }}>({t.divisionName})</span></span>
            <span className="tabular-nums" style={{ color: "#8FA599", fontFamily: "ui-monospace, monospace" }}>
              {t.wins}-{t.losses}-{t.otLosses} · {(t.pointPctg * 100).toFixed(1)}% pts · {t.streakCode ? `${t.streakCode}${t.streakCount}` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {renderTable(east, "Conferencia Este")}
      {renderTable(west, "Conferencia Oeste")}
      <p className="text-[10px] leading-relaxed" style={{ color: "#5A7368" }}>
        Récord real, % de puntos, y racha actual — vía la API pública y oficial de la NHL. Si la temporada regular 2026-27 todavía no tiene juegos reales jugados, esto muestra la última temporada regular completa como referencia honesta.
      </p>
    </div>
  );
}

export default function DiamondStatsNHL({ onBackToMenu }) {
  const [view, setView] = useState("juegos"); // "juegos" | "posiciones"
  const [selectedGame, setSelectedGame] = useState(null);

  return (
    <div className="min-h-screen w-full" style={{ background: "#0B1F17" }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: "#C8393E" }} />
            <span className="text-[11px] tracking-[0.25em] uppercase" style={{ color: "#8FA599", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
              NHL Analytics — Fase 1
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

        {!selectedGame && (
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
              Juegos de hoy
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
        )}

        {selectedGame ? (
          <GameDetail game={selectedGame} onBack={() => setSelectedGame(null)} />
        ) : view === "juegos" ? (
          <GamesList onSelect={setSelectedGame} />
        ) : (
          <Standings />
        )}

        {!selectedGame && (
          <p className="text-[10px] mt-8 leading-relaxed" style={{ color: "#5A7368" }}>
            Fase 1: probabilidad real con Log5 sobre % de puntos real + ventaja de casa (dato real citado) + forma reciente + récord casa/ruta + fuerza real de calendario + récord real por división/conferencia del rival. Pendiente: portero titular real, Over/Under, y backtesting guardado — llegan en la siguiente fase. La temporada regular 2026-27 recién empieza (hoy solo hay pretemporada), así que el récord real usado por ahora es el de la última temporada regular completa.
          </p>
        )}
      </div>
    </div>
  );
}
