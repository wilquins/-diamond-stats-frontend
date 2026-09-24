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

// Save % promedio real de la liga en 2023-24 (.903) — fuente: StatMuse,
// sobre 79,025 tiros reales de toda la NHL
// (https://www.statmuse.com/nhl/ask/nhl-league-average-goalie-save-percentage-in-2024).
// Mismo principio que el ERA promedio de liga en MLB: mide qué tan
// bueno/malo es el portero titular de HOY frente al promedio real.
const NHL_LEAGUE_AVG_SAVE_PCT = 0.903;

// Cuánta ventaja aporta un portero según qué tan por arriba/abajo del
// save% promedio de liga está su temporada real — mismo principio que
// pitcherEdge() en MLB con el ERA. Escala moderada: un portero de élite
// (.925) vale ~+5.5%, uno flojo (.880) vale ~-5.75%.
function goalieEdge(savePct) {
  if (savePct == null) return 0;
  return Math.max(-0.08, Math.min(0.08, (savePct - NHL_LEAGUE_AVG_SAVE_PCT) * 2.5));
}

// Calcula la probabilidad real de ganar de un partido de NHL: récord real
// (Log5 sobre % de puntos) + ventaja de casa + forma reciente real
// (últimos 10) + récord real de casa del local vs. ruta del visitante +
// fuerza real de calendario + portero titular real confirmado por ESPN,
// cruzado con sus estadísticas reales y oficiales de la NHL (save%, GAA).
//
// Si el portero titular todavía no está confirmado/proyectado (normal
// varias horas antes del juego) o no se pudo cruzar con sus stats reales,
// ese factor simplemente no se aplica — nunca se rellena con un número
// inventado.
async function computeNhlWinProb(home, away, goalies) {
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

  // El portero del LOCAL detiene tiros del ataque visitante y viceversa —
  // por eso la resta va cruzada: la ventaja neta es el portero de casa
  // MENOS el portero visitante, ambos frente al mismo promedio de liga.
  const goalieAdj = goalieEdge(goalies?.home?.stats?.savePercentage) - goalieEdge(goalies?.away?.stats?.savePercentage);

  const prob = Math.min(0.92, Math.max(0.08, baseProb + NHL_HOME_ADVANTAGE + formAdj + homeRoadAdj + sosAdj + goalieAdj));
  return { prob, formAdj, homeRoadAdj, sosAdj, goalieAdj, homeSchedule, awaySchedule };
}

// ---- Distribución de Poisson — mismo modelo que ya usamos en MLB para
// datos de "conteo" como goles/carreras en un juego. ----
function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
function poissonCDF(k, lambda) {
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += (Math.exp(-lambda) * Math.pow(lambda, i)) / factorial(i);
  return sum;
}

// Over/Under real de NHL: goles esperados del local (promedio entre su
// ataque real y la defensa real del rival) + goles esperados del
// visitante (mismo principio al revés), pasado por Poisson — la suma de
// dos variables Poisson independientes es también Poisson (con lambda =
// suma de ambas), así que no hace falta nada más elaborado. Si hay
// portero titular real confirmado, su save% real ajusta un poco el total
// esperado hacia abajo (portero de élite) o arriba (portero flojo).
function computeNhlOverUnder(home, away, goalies) {
  if (!home?.gamesPlayed || !away?.gamesPlayed) return null;
  const homeGFAvg = home.goalFor / home.gamesPlayed;
  const homeGAAvg = home.goalAgainst / home.gamesPlayed;
  const awayGFAvg = away.goalFor / away.gamesPlayed;
  const awayGAAvg = away.goalAgainst / away.gamesPlayed;

  let expectedHomeGoals = (homeGFAvg + awayGAAvg) / 2;
  let expectedAwayGoals = (awayGFAvg + homeGAAvg) / 2;

  const homeGoalieAdj = goalieEdge(goalies?.home?.stats?.savePercentage);
  const awayGoalieAdj = goalieEdge(goalies?.away?.stats?.savePercentage);
  // Un portero de élite reduce los goles reales que le meten (no los que
  // anota su propio equipo) — por eso el ajuste del portero LOCAL golpea
  // los goles esperados del VISITANTE, y viceversa.
  expectedAwayGoals *= 1 - homeGoalieAdj;
  expectedHomeGoals *= 1 - awayGoalieAdj;

  const expectedTotal = Math.max(1, expectedHomeGoals + expectedAwayGoals);
  const line = Math.round(expectedTotal - 0.5) + 0.5;
  const underProb = poissonCDF(Math.floor(line), expectedTotal);
  const overProb = 1 - underProb;
  return { line, overProb, underProb, expectedTotal };
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
  const [goalies, setGoalies] = useState(null);
  const [overUnder, setOverUnder] = useState(null);
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
      if (!home || !away) { if (!cancelled) setStatus("listo"); return; }

      // Portero titular real de hoy — se necesita el nombre COMPLETO real
      // de cada equipo (no el abreviado) para emparejar con el evento de
      // ESPN, que es la única fuente real que confirma el titular antes
      // del juego.
      const gameDateET = new Date(game.startTimeUTC).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const g = home.fullName && away.fullName
        ? await fetch(`${BACKEND_URL}/api/nhl/goalies/${game.homeCode}/${game.awayCode}?date=${gameDateET}&homeName=${encodeURIComponent(home.fullName)}&awayName=${encodeURIComponent(away.fullName)}`)
            .then((r) => r.json()).catch(() => null)
        : null;
      if (cancelled) return;
      setGoalies(g);

      const r = await computeNhlWinProb(home, away, g);
      if (cancelled) return;
      setResult(r);
      const ou = computeNhlOverUnder(home, away, g);
      setOverUnder(ou);
      setStatus("listo");

      // Guarda la predicción real ANTES de saberse el resultado — mismo
      // principio de backtesting honesto que ya usamos en MLB/NFL. Los
      // juegos de pretemporada NO se guardan: no miden nada real sobre la
      // fuerza real del equipo titular, y contaminarían la precisión.
      if (!game.isPreseason && r) {
        fetch(`${BACKEND_URL}/api/nhl/predictions/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game_date: gameDateET, home_code: game.homeCode, away_code: game.awayCode, home_win_prob: r.prob }),
        }).catch(() => {});
      }
      if (!game.isPreseason && ou) {
        fetch(`${BACKEND_URL}/api/nhl/overunder/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game_date: gameDateET, home_code: game.homeCode, away_code: game.awayCode, line: ou.line, over_prob: ou.overProb, expected_total: ou.expectedTotal }),
        }).catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [game.homeCode, game.awayCode, game.startTimeUTC, game.isPreseason]);

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
                Probabilidad de ganar (Log5 sobre % de puntos real + ventaja de casa + forma reciente + récord casa/ruta + fuerza real de calendario{(goalies?.home?.stats || goalies?.away?.stats) ? " + portero titular real" : ""})
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

        <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
          <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
            Over/Under estimado{overUnder ? ` · línea ${overUnder.line} goles` : ""}
          </div>
          {overUnder ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between text-xs p-2 rounded-md" style={{ background: overUnder.overProb >= overUnder.underProb ? "#1A362A" : "#0F251C" }}>
                  <span style={{ color: overUnder.overProb >= overUnder.underProb ? "#FFB627" : "#C9D6CD" }}>Over {overUnder.line}</span>
                  <span className="font-bold tabular-nums" style={{ color: overUnder.overProb >= overUnder.underProb ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{(overUnder.overProb * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between text-xs p-2 rounded-md" style={{ background: overUnder.underProb > overUnder.overProb ? "#1A362A" : "#0F251C" }}>
                  <span style={{ color: overUnder.underProb > overUnder.overProb ? "#FFB627" : "#C9D6CD" }}>Under {overUnder.line}</span>
                  <span className="font-bold tabular-nums" style={{ color: overUnder.underProb > overUnder.overProb ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{(overUnder.underProb * 100).toFixed(1)}%</span>
                </div>
              </div>
              <p className="text-[10px] mt-2.5 leading-relaxed" style={{ color: "#5A7368" }}>
                Goles totales esperados: {overUnder.expectedTotal.toFixed(2)} — combina el ataque y la defensa reales de ambos equipos esta temporada de referencia{(goalies?.home?.stats || goalies?.away?.stats) ? ", ajustado por el save% real del portero titular confirmado" : ""}, pasado por una distribución de Poisson (mismo modelo que ya usamos en MLB).
              </p>
            </>
          ) : (
            <p className="text-[11px]" style={{ color: "#5A7368" }}>
              Sin datos suficientes todavía — uno de los dos equipos no tiene juegos reales jugados en la temporada de referencia.
            </p>
          )}
        </div>

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

        {(goalies?.home || goalies?.away) && (
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Portero titular real (confirmado por ESPN)</div>
            <div className="grid grid-cols-2 gap-3 text-[11px]" style={{ color: "#8FA599" }}>
              {[{ label: game.awayName, g: goalies?.away }, { label: game.homeName, g: goalies?.home }].map(({ label, g }, i) => (
                <div key={i}>
                  <div className="font-semibold mb-1" style={{ color: "#EDEAE1" }}>{label}</div>
                  {g ? (
                    <>
                      <div style={{ color: "#FFB627" }}>{g.name} <span style={{ color: g.status === "Confirmed" ? "#3FC97A" : "#8FA599", fontSize: "9px" }}>({g.status === "Confirmed" ? "confirmado" : "proyectado"})</span></div>
                      {g.stats ? (
                        <>
                          <div>Save%: <b style={{ color: "#C9D6CD" }}>{(g.stats.savePercentage * 100).toFixed(1)}%</b> · GAA: <b style={{ color: "#C9D6CD" }}>{g.stats.goalsAgainstAverage?.toFixed(2)}</b></div>
                          <div>{g.stats.wins}-{g.stats.losses} en {g.stats.gamesPlayed} juegos reales esta temporada</div>
                        </>
                      ) : (
                        <div style={{ color: "#5A7368" }}>Sin stats reales cruzadas todavía.</div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: "#5A7368" }}>Sin confirmar todavía.</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] leading-relaxed" style={{ color: "#5A7368" }}>
          Fase 2: portero titular real (confirmado por ESPN, cruzado con sus stats oficiales de NHL) + Over/Under con Poisson. Pendiente: backtesting real guardado en Supabase, para medir qué tan certero es el modelo — igual que ya existe en MLB y NFL.
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

// ---- Precisión real de probabilidad de ganar ----
function WinProbAccuracy() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");
  const [checking, setChecking] = useState(false);

  const load = () => {
    setStatus("cargando");
    fetch(`${BACKEND_URL}/api/nhl/predictions/accuracy`)
      .then((r) => r.json())
      .then((d) => { setData(d); setStatus("listo"); })
      .catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, []);

  const checkNow = () => {
    setChecking(true);
    fetch(`${BACKEND_URL}/api/nhl/predictions/check`, { method: "POST" })
      .then((r) => r.json())
      .then(() => { load(); setChecking(false); })
      .catch(() => setChecking(false));
  };

  return (
    <div className="rounded-xl border p-6 mb-4" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>Backtesting real — Probabilidad de ganar</div>
      <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>¿Qué tan certero es el modelo?</h2>

      <button
        onClick={checkNow}
        disabled={checking}
        className="mb-4 px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: "#1A362A", color: "#FFB627", border: "1px solid #2A4D3B", opacity: checking ? 0.6 : 1 }}
      >
        {checking ? "Revisando resultados reales…" : "Revisar predicciones de días anteriores"}
      </button>

      {status === "cargando" && <p className="text-[11px]" style={{ color: "#8FA599" }}>Cargando…</p>}
      {status === "error" && <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>}

      {status === "listo" && data && data.totalChecked === 0 && (
        <p className="text-[13px]" style={{ color: "#8FA599" }}>
          Todavía no hay predicciones comparadas contra resultados reales. La app guarda una predicción cada vez que entras al detalle de un partido de temporada regular pendiente (los de pretemporada no cuentan) — vuelve cuando haya juegos reales terminados y presiona "Revisar predicciones de días anteriores".
        </p>
      )}

      {status === "listo" && data && data.totalChecked > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3.5 rounded-lg border text-center" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-2xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>{(data.accuracy * 100).toFixed(1)}%</div>
              <div className="text-[10px] tracking-widest uppercase mt-1" style={{ color: "#8FA599" }}>Acertó al favorito</div>
            </div>
            <div className="p-3.5 rounded-lg border text-center" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-2xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>{data.brierScore.toFixed(3)}</div>
              <div className="text-[10px] tracking-widest uppercase mt-1" style={{ color: "#8FA599" }}>Brier Score (0=perfecto, 0.25=azar)</div>
            </div>
          </div>
          <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Basado en {data.totalChecked} predicciones reales comparadas</div>
          <div className="space-y-1.5">
            {data.recent.map((r, i) => {
              const predictedFavorite = r.homeWinProb >= 0.5 ? r.home : r.away;
              const correct = predictedFavorite === r.actualWinner;
              return (
                <div key={i} className="flex items-center justify-between text-[11px] p-2 rounded" style={{ background: "#12281E" }}>
                  <span style={{ color: "#C9D6CD" }}>{r.date} · {r.away} @ {r.home}</span>
                  <span style={{ color: "#8FA599" }}>Dio {(r.homeWinProb * 100).toFixed(0)}% a {r.home}</span>
                  <span style={{ color: correct ? "#3FC97A" : "#C8393E", fontWeight: 700 }}>{correct ? "✓ acertó" : "✗ falló"} (ganó {r.actualWinner})</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Precisión real de Over/Under ----
function OverUnderAccuracy() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");
  const [checking, setChecking] = useState(false);

  const load = () => {
    setStatus("cargando");
    fetch(`${BACKEND_URL}/api/nhl/overunder/accuracy`)
      .then((r) => r.json())
      .then((d) => { setData(d); setStatus("listo"); })
      .catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, []);

  const checkNow = () => {
    setChecking(true);
    fetch(`${BACKEND_URL}/api/nhl/overunder/check`, { method: "POST" })
      .then((r) => r.json())
      .then(() => { load(); setChecking(false); })
      .catch(() => setChecking(false));
  };

  return (
    <div className="rounded-xl border p-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>Backtesting real — Over/Under</div>
      <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>¿Qué tan certero es el Over/Under?</h2>

      <button
        onClick={checkNow}
        disabled={checking}
        className="mb-4 px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: "#1A362A", color: "#FFB627", border: "1px solid #2A4D3B", opacity: checking ? 0.6 : 1 }}
      >
        {checking ? "Revisando resultados reales…" : "Revisar Over/Under de días anteriores"}
      </button>

      {status === "cargando" && <p className="text-[11px]" style={{ color: "#8FA599" }}>Cargando…</p>}
      {status === "error" && <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>}

      {status === "listo" && data && data.totalChecked === 0 && (
        <p className="text-[13px]" style={{ color: "#8FA599" }}>
          Todavía no hay Over/Under comparados contra resultados reales. La app guarda una predicción cada vez que entras al detalle de un partido de temporada regular — vuelve cuando haya juegos reales terminados y presiona "Revisar Over/Under de días anteriores".
        </p>
      )}

      {status === "listo" && data && data.totalChecked > 0 && (
        <>
          <div className="p-3.5 rounded-lg border text-center mb-4" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-2xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>{(data.accuracy * 100).toFixed(1)}%</div>
            <div className="text-[10px] tracking-widest uppercase mt-1" style={{ color: "#8FA599" }}>Acertó Over/Under ({data.totalChecked} decisivos)</div>
          </div>
          <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Últimas comparaciones</div>
          <div className="space-y-1.5">
            {data.recent.map((r, i) => {
              const predictedSide = r.overProb >= 0.5 ? "Over" : "Under";
              const isPush = r.actualResult === "push";
              const correct = !isPush && r.actualResult === predictedSide.toLowerCase();
              return (
                <div key={i} className="flex items-center justify-between text-[11px] p-2 rounded" style={{ background: "#12281E" }}>
                  <span style={{ color: "#C9D6CD" }}>{r.date} · {r.away} @ {r.home}</span>
                  <span style={{ color: "#8FA599" }}>Línea {r.line} · Dio {predictedSide}</span>
                  <span style={{ color: "#C9D6CD" }}>{r.actualTotalGoals} goles reales</span>
                  <span style={{ color: isPush ? "#8FA599" : correct ? "#3FC97A" : "#C8393E", fontWeight: 700 }}>
                    {isPush ? "Push" : correct ? "✓ acertó" : "✗ falló"}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function DiamondStatsNHL({ onBackToMenu }) {
  const [view, setView] = useState("juegos"); // "juegos" | "posiciones" | "precision"
  const [selectedGame, setSelectedGame] = useState(null);

  return (
    <div className="min-h-screen w-full" style={{ background: "#0B1F17" }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: "#C8393E" }} />
            <span className="text-[11px] tracking-[0.25em] uppercase" style={{ color: "#8FA599", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
              NHL Analytics — Fase 2
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
            <button
              onClick={() => setView("precision")}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: view === "precision" ? "#FFB627" : "#12281E",
                color: view === "precision" ? "#0B1F17" : "#8FA599",
                border: "1px solid " + (view === "precision" ? "#FFB627" : "#1F3D30"),
              }}
            >
              Precisión
            </button>
          </div>
        )}

        {selectedGame ? (
          <GameDetail game={selectedGame} onBack={() => setSelectedGame(null)} />
        ) : view === "juegos" ? (
          <GamesList onSelect={setSelectedGame} />
        ) : view === "posiciones" ? (
          <Standings />
        ) : (
          <>
            <WinProbAccuracy />
            <OverUnderAccuracy />
          </>
        )}

        {!selectedGame && (
          <p className="text-[10px] mt-8 leading-relaxed" style={{ color: "#5A7368" }}>
            Fase 2: probabilidad real con Log5 sobre % de puntos real + ventaja de casa (dato real citado) + forma reciente + récord casa/ruta + fuerza real de calendario + récord real por división/conferencia del rival + portero titular real (confirmado por ESPN, cruzado con sus stats oficiales de NHL), más Over/Under con Poisson y backtesting real guardado — igual que ya existe en MLB y NFL. La temporada regular 2026-27 recién empieza (hoy solo hay pretemporada, que no se guarda para precisión), así que el récord real usado por ahora es el de la última temporada regular completa.
          </p>
        )}
      </div>
    </div>
  );
}
