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
// Ahora la ventaja de casa se MIDE de los récords reales de la liga (ver
// computeNhlWinProb); este 3% (en línea con esa fuente) solo se usa de
// respaldo si el backend no trae el dato.
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


// ---- Historial del portero contra el rival de hoy (últimas 5 temporadas,
// temporada regular, solo aperturas). Fuente: game-log oficial de la NHL.
// Se activa tras GOALIE_VS_MIN_STARTS aperturas contra ese equipo.
// DECISIONES SUBJETIVAS (no citadas): GOALIE_VS_SHRINK_SHOTS = 600 tiros
// (~21 aperturas; no se encontró una cifra publicada de estabilización de
// save% que usar), tope ±3%, y 1 gol ≈ 1/6 de probabilidad de ganar
// (~6 goles = 1 victoria, regla estándar de hockey analytics).
const GOALIE_VS_MIN_STARTS = 2;
const GOALIE_VS_SHRINK_SHOTS = 600;
const GOALIE_WIN_PER_GOAL = 1 / 6;
const GOALIE_VS_CAP = 0.03;

function goalieVsEffect(vs) {
  const t = vs?.vsTeam, o = vs?.overall;
  if (!t || !o || t.savePct == null || o.savePct == null || t.starts < GOALIE_VS_MIN_STARTS || !o.starts) return 0;
  const shotsPerStart = o.shotsAgainst / o.starts;
  const goalsSaved = (t.savePct - o.savePct) * shotsPerStart; // goles/juego mejor (+) o peor (-) que su normal
  const shrink = t.shotsAgainst / (t.shotsAgainst + GOALIE_VS_SHRINK_SHOTS);
  return Math.max(-GOALIE_VS_CAP, Math.min(GOALIE_VS_CAP, goalsSaved * GOALIE_WIN_PER_GOAL * shrink));
}

// Agrega g.home.vs / g.away.vs (el portero local enfrenta al visitante y viceversa).
async function enrichGoaliesVs(g, homeCode, awayCode) {
  if (!g) return g;
  const get = (goalie, opp) => goalie?.stats?.id
    ? fetch(`${BACKEND_URL}/api/nhl/goalie/${goalie.stats.id}/vs-team/${opp}`).then((r) => r.json()).then((d) => (d?.error ? null : d)).catch(() => null)
    : Promise.resolve(null);
  const [hv, av] = await Promise.all([get(g.home, awayCode), get(g.away, homeCode)]);
  return { ...g, home: g.home ? { ...g.home, vs: hv } : g.home, away: g.away ? { ...g.away, vs: av } : g.away };
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
// Mapa código -> equipo, con los promedios REALES de la liga (casa/ruta,
// medidos por el backend) pegados a cada equipo, para poder descontar la
// ventaja de casa de la liga en computeNhlWinProb.
function buildNhlTeamMap(standingsData) {
  const league = standingsData?.league || null;
  return Object.fromEntries((standingsData?.teams || []).map((t) => [t.code, { ...t, league }]));
}

// Regresión a la media con la temporada anterior (Fase 2 del modelo NHL).
// Con 5-6 juegos jugados, un % de puntos de .900 es sobre todo suerte. Cifra
// citada: ~38% de las diferencias en la tabla de una temporada de 82 juegos
// es pura suerte (Desjardins 38%, Weissbock 37.6% —
// https://thefivehohl.substack.com/p/what-does-regression-to-the-mean). Con
// eso, la confiabilidad tras n juegos es n/(n+k) con k = 82×0.38/0.62 ≈ 50
// juegos (DERIVADO de esas cifras, no medido por mí). El prior de cada
// equipo es su % de puntos de la temporada pasada completa, encogido hacia
// .500 con la misma confiabilidad de 82 juegos (82/132 ≈ 0.62). Límites:
// k=50 se derivó para regresar a la media de la liga; usarlo con el prior
// propio del equipo es una aproximación, y NO se descuenta por cambios de
// plantilla (no hay dato para estimarlo).
const NHL_REGRESSION_GAMES = 50;
const NHL_PRIOR_RELIABILITY = 82 / (82 + NHL_REGRESSION_GAMES);
function blendedStrength(t) {
  const cur = t.pointPctg ?? 0.5;
  const gp = t.gamesPlayed ?? 0;
  const priorRaw = t.prior?.pointPctg;
  if (priorRaw == null || gp >= 200) return { value: cur, priorWeight: 0 };
  const prior = 0.5 + NHL_PRIOR_RELIABILITY * (priorRaw - 0.5);
  const priorWeight = NHL_REGRESSION_GAMES / (gp + NHL_REGRESSION_GAMES);
  return { value: (1 - priorWeight) * cur + priorWeight * prior, priorWeight };
}

async function computeNhlWinProb(home, away, goalies) {
  if (!home || !away) return null;

  // Fuerza base: % de puntos de esta temporada mezclado con el de la pasada
  // según cuántos juegos van. Para casa/ruta se usa el % de puntos CRUDO de
  // esta temporada, porque se compara contra récords de esta temporada.
  const homeBlend = blendedStrength(home);
  const awayBlend = blendedStrength(away);
  const homeStrength = homeBlend.value;
  const awayStrength = awayBlend.value;
  const homeRaw = home.pointPctg ?? 0.5;
  const awayRaw = away.pointPctg ?? 0.5;
  const baseProb = log5(homeStrength, awayStrength);
  const minGP = Math.min(home.gamesPlayed ?? 0, away.gamesPlayed ?? 0);

  const homeL10 = pointsPct(home.l10Wins, home.l10Losses, home.l10OtLosses);
  const awayL10 = pointsPct(away.l10Wins, away.l10Losses, away.l10OtLosses);
  // Con menos de 10 juegos, "últimos 10" es la temporada entera y ya está en
  // la fuerza base: sumarlo contaría la misma información dos veces.
  const formAdj = homeL10 != null && awayL10 != null && minGP >= 10 ? (homeL10 - awayL10) * 0.15 : 0;

  // Casa/ruta propio de cada equipo, DESCONTANDO lo que ya cuenta la
  // ventaja de casa de la liga: antes se sumaban las dos cosas y la
  // ventaja de casa quedaba contada dos veces (medido: la liga ganó
  // ~52.4% de local en 2025-26, o sea ~+2.4%, pero el modelo sumaba ~+6%).
  // Peso 0.5 = decisión subjetiva.
  const lg = home.league || null;
  const homeHomePct = pointsPct(home.homeWins, home.homeLosses, home.homeOtLosses);
  const awayRoadPct = pointsPct(away.roadWins, away.roadLosses, away.roadOtLosses);
  let homeRoadAdj = 0;
  if (homeHomePct != null && awayRoadPct != null && lg) {
    const leagueHomeDelta = lg.homePtsPct - lg.overallPtsPct; // casa vs promedio, liga
    const leagueRoadDelta = lg.roadPtsPct - lg.overallPtsPct; // ruta vs promedio, liga
    const homeSpecific = (homeHomePct - homeRaw) - leagueHomeDelta;
    const awaySpecific = (awayRoadPct - awayRaw) - leagueRoadDelta;
    // Con pocos juegos el récord casa/ruta es casi puro ruido: se escala por
    // min(1, juegos/30) (decisión SUBJETIVA, mismo criterio que NFL).
    homeRoadAdj = (homeSpecific - awaySpecific) * 0.5 * Math.min(1, minGP / 30);
  }
  // Ventaja de casa de la liga: % de victorias de local MEDIDO de los
  // récords reales (si el backend no lo trae, la constante citada).
  const homeAdvantage = lg ? lg.homeWinRate - 0.5 : NHL_HOME_ADVANTAGE;

  const [homeSchedule, awaySchedule] = await Promise.all([
    fetch(`${BACKEND_URL}/api/nhl/team/${home.code}/schedule-analysis`).then((r) => r.json()).catch(() => null),
    fetch(`${BACKEND_URL}/api/nhl/team/${away.code}/schedule-analysis`).then((r) => r.json()).catch(() => null),
  ]);
  let sosAdj = 0;
  if (homeSchedule?.avgOpponentWinPct != null && awaySchedule?.avgOpponentWinPct != null) {
    sosAdj = (homeSchedule.avgOpponentWinPct - awaySchedule.avgOpponentWinPct) * 0.3 * Math.min(1, minGP / 30);
  }

  // El portero del LOCAL detiene tiros del ataque visitante y viceversa —
  // por eso la resta va cruzada: la ventaja neta es el portero de casa
  // MENOS el portero visitante, ambos frente al mismo promedio de liga.
  const goalieVsAdj = goalieVsEffect(goalies?.home?.vs) - goalieVsEffect(goalies?.away?.vs);
  const goalieAdj = goalieEdge(goalies?.home?.stats?.savePercentage) - goalieEdge(goalies?.away?.stats?.savePercentage) + goalieVsAdj;

  const prob = Math.min(0.92, Math.max(0.08, baseProb + homeAdvantage + formAdj + homeRoadAdj + sosAdj + goalieAdj));
  return { prob, homeAdvantage, formAdj, homeRoadAdj, sosAdj, goalieAdj, goalieVsAdj, homeSchedule, awaySchedule, homeStrength, awayStrength, homeRaw, awayRaw, homePriorWeight: homeBlend.priorWeight, awayPriorWeight: awayBlend.priorWeight };
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
// ---- Guarda automáticamente la predicción de cada juego de temporada
// regular que TODAVÍA NO empieza, sin necesidad de abrir su detalle —
// antes solo se guardaba al tocar cada juego, así que si no los abrías
// uno por uno no se acumulaba backtesting. Solo juegos "FUT" (no
// empezados): una predicción hecha con el juego ya en curso o terminado
// usaría una tabla que ya incluye el resultado, y contaminaría la
// precisión. El servidor ignora duplicados (la primera predicción gana).
async function predictAndSaveGame(game, map) {
  if (game.isPreseason || game.gameState !== "FUT") return;
  const home = map[game.homeCode];
  const away = map[game.awayCode];
  if (!home || !away) return;
  const gameDateET = new Date(game.startTimeUTC).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  let g = home.fullName && away.fullName
    ? await fetch(`${BACKEND_URL}/api/nhl/goalies/${game.homeCode}/${game.awayCode}?date=${gameDateET}&homeName=${encodeURIComponent(home.fullName)}&awayName=${encodeURIComponent(away.fullName)}`)
        .then((r) => r.json()).catch(() => null)
    : null;
  g = await enrichGoaliesVs(g, game.homeCode, game.awayCode);
  const r = await computeNhlWinProb(home, away, g);
  const ou = computeNhlOverUnder(home, away, g);
  if (r) {
    await fetch(`${BACKEND_URL}/api/nhl/predictions/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_date: gameDateET, home_code: game.homeCode, away_code: game.awayCode, home_win_prob: r.prob }),
    }).catch(() => {});
  }
  if (ou) {
    await fetch(`${BACKEND_URL}/api/nhl/overunder/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_date: gameDateET, home_code: game.homeCode, away_code: game.awayCode, line: ou.line, over_prob: ou.overProb, expected_total: ou.expectedTotal }),
    }).catch(() => {});
  }
}

// ---- Jugadores más probables a gol / asistencia / punto ----
// Probabilidad real de al menos 1 gol, 1 asistencia o 1 punto vía Poisson
// sobre su tasa real por juego esta temporada (mismo principio que TD en
// NFL y jonrón en MLB). Se muestra "PJ" (partidos jugados) porque con la
// temporada recién empezada la muestra es chica y el número es ruidoso.
function TopPlayersPanel({ teamCodes, title }) {
  const [players, setPlayers] = useState(null);
  const codesKey = [...teamCodes].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    setPlayers(null);
    (async () => {
      const perTeam = await Promise.all(
        codesKey.split(",").filter(Boolean).map(async (code) => {
          const d = await fetch(`${BACKEND_URL}/api/nhl/team/${code}/skater-stats`).then((r) => r.json()).catch(() => ({ players: [] }));
          return (d.players || []).map((p) => ({ ...p, team: code }));
        })
      );
      if (!cancelled) setPlayers(perTeam.flat());
    })();
    return () => { cancelled = true; };
  }, [codesKey]);

  if (!codesKey) return null;
  if (!players) return <p className="text-[11px] mb-4" style={{ color: "#8FA599" }}>Calculando jugadores más probables…</p>;

  // Desempate fijo (más partidos jugados, luego nombre) para que el orden
  // no cambie entre pantallas cuando hay empates exactos.
  const top = (key) =>
    [...players]
      .sort((a, b) => b[key] - a[key] || b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name))
      .slice(0, 3);
  const sections = [
    { title: "Mayor probabilidad de gol hoy", key: "goalProbability", detail: (p) => `${p.goals} G en ${p.gamesPlayed} PJ` },
    { title: "Mayor probabilidad de asistencia hoy", key: "assistProbability", detail: (p) => `${p.assists} A en ${p.gamesPlayed} PJ` },
    { title: "Mayor probabilidad de punto hoy (gol o asistencia)", key: "pointProbability", detail: (p) => `${p.points} PTS en ${p.gamesPlayed} PJ` },
  ];

  return (
    <div className="mt-6 mb-4 space-y-6">
      {sections.map((sec) => {
        const items = top(sec.key);
        return (
          <div key={sec.key} className="rounded-xl border p-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
            <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>{title}</div>
            <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>{sec.title}</h2>
            {items.length === 0 ? (
              <p className="text-[11px]" style={{ color: "#8FA599" }}>Sin datos reales suficientes todavía.</p>
            ) : (
              <div className="space-y-3">
                {items.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: i === 0 ? "#FFB627" : "#1F3D30" }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0" style={{ background: "#1A362A", color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold" style={{ color: "#EDEAE1" }}>{p.name}</div>
                      <div className="text-[11px]" style={{ color: "#8FA599" }}>{p.team} · {p.position} · {sec.detail(p)}</div>
                    </div>
                    <div className="text-xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                      {(p[sec.key] * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] mt-3 leading-relaxed" style={{ color: "#5A7368" }}>
              Probabilidad real de al menos 1 por juego, con la tasa real de cada jugador esta temporada (Poisson). "PJ" = partidos jugados: con pocos, el número es ruidoso y mejora conforme avance la temporada.
            </p>
          </div>
        );
      })}
    </div>
  );
}

function GamesList({ onSelect }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/nhl/games`)
      .then((r) => r.json())
      .then(async (d) => {
        if (cancelled) return;
        setData(d);
        setStatus("listo");
        // Guardado automático de backtesting para todos los juegos de hoy
        // que aún no empiezan (ver predictAndSaveGame).
        const pending = (d.games || []).filter((g) => !g.isPreseason && g.gameState === "FUT");
        if (pending.length > 0) {
          const standingsData = await fetch(`${BACKEND_URL}/api/nhl/standings`).then((r) => r.json()).catch(() => ({ teams: [] }));
          const map = buildNhlTeamMap(standingsData);
          await Promise.all(pending.map((g) => predictAndSaveGame(g, map).catch(() => {})));
        }
      })
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
      const map = buildNhlTeamMap(standingsData);
      const home = map[game.homeCode];
      const away = map[game.awayCode];
      setTeams({ home, away });
      if (!home || !away) { if (!cancelled) setStatus("listo"); return; }

      // Portero titular real de hoy — se necesita el nombre COMPLETO real
      // de cada equipo (no el abreviado) para emparejar con el evento de
      // ESPN, que es la única fuente real que confirma el titular antes
      // del juego.
      const gameDateET = new Date(game.startTimeUTC).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      let g = home.fullName && away.fullName
        ? await fetch(`${BACKEND_URL}/api/nhl/goalies/${game.homeCode}/${game.awayCode}?date=${gameDateET}&homeName=${encodeURIComponent(home.fullName)}&awayName=${encodeURIComponent(away.fullName)}`)
            .then((r) => r.json()).catch(() => null)
        : null;
      g = await enrichGoaliesVs(g, game.homeCode, game.awayCode);
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
      if (!game.isPreseason && game.gameState === "FUT" && r) {
        fetch(`${BACKEND_URL}/api/nhl/predictions/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game_date: gameDateET, home_code: game.homeCode, away_code: game.awayCode, home_win_prob: r.prob }),
        }).catch(() => {});
      }
      if (!game.isPreseason && game.gameState === "FUT" && ou) {
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
              {(result.homePriorWeight > 0 || result.awayPriorWeight > 0) && (
                <p className="text-[10px] mb-2" style={{ color: "#5A7368" }}>
                  Fuerza base mezclada con la temporada pasada (pocos juegos jugados): {game.awayName} {(result.awayRaw * 100).toFixed(1)}% actual → {(result.awayStrength * 100).toFixed(1)}% usado ({(result.awayPriorWeight * 100).toFixed(0)}% peso de la temporada pasada) · {game.homeName} {(result.homeRaw * 100).toFixed(1)}% actual → {(result.homeStrength * 100).toFixed(1)}% usado ({(result.homePriorWeight * 100).toFixed(0)}% peso de la temporada pasada). La constante (50 juegos) se derivó de que ~38% de la tabla es suerte; no se descuentan cambios de plantilla.
                </p>
              )}
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
                          {(() => {
                            const t = g.vs?.vsTeam, o = g.vs?.overall;
                            const opp = label === game.homeName ? game.awayName : game.homeName;
                            if (!t || !o) return null;
                            if (t.starts === 0) return <div className="mt-1" style={{ color: "#5A7368" }}>Nunca ha abierto contra {opp} en las últimas 5 temporadas.</div>;
                            const eff = goalieVsEffect(g.vs);
                            const pct = (v) => (v == null ? "—" : (v * 100).toFixed(1) + "%");
                            return (
                              <div className="mt-1 pt-1 border-t" style={{ borderColor: "#1F3D30" }}>
                                <div style={{ color: "#EDEAE1" }}>Contra {opp} (últ. 5 temporadas)</div>
                                <div>{t.starts} aperturas: <b style={{ color: "#C9D6CD" }}>{t.wins}-{t.losses}{t.otLosses ? `-${t.otLosses}` : ""}</b> · Save% <b style={{ color: "#C9D6CD" }}>{pct(t.savePct)}</b> (total {pct(o.savePct)}) · GAA <b style={{ color: "#C9D6CD" }}>{t.gaa?.toFixed(2) ?? "—"}</b> (total {o.gaa?.toFixed(2) ?? "—"})</div>
                                {g.vs.vsTeamAtHome?.starts > 0 && <div>En casa: {g.vs.vsTeamAtHome.wins}-{g.vs.vsTeamAtHome.losses}{g.vs.vsTeamAtHome.otLosses ? `-${g.vs.vsTeamAtHome.otLosses}` : ""} · Save% {pct(g.vs.vsTeamAtHome.savePct)}</div>}
                                {g.vs.vsTeamOnRoad?.starts > 0 && <div>De visita: {g.vs.vsTeamOnRoad.wins}-{g.vs.vsTeamOnRoad.losses}{g.vs.vsTeamOnRoad.otLosses ? `-${g.vs.vsTeamOnRoad.otLosses}` : ""} · Save% {pct(g.vs.vsTeamOnRoad.savePct)}</div>}
                                <div style={{ color: t.starts >= GOALIE_VS_MIN_STARTS ? "#FFB627" : "#5A7368" }}>
                                  {t.starts >= GOALIE_VS_MIN_STARTS
                                    ? `Efecto en la probabilidad: ${eff >= 0 ? "+" : ""}${(eff * 100).toFixed(1)}% (pocas aperturas pesan poco)`
                                    : `Aún no cuenta: se activa desde ${GOALIE_VS_MIN_STARTS} aperturas contra este rival.`}
                                </div>
                              </div>
                            );
                          })()}
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

        <TopPlayersPanel title="Picks de este juego" teamCodes={[game.homeCode, game.awayCode]} />

        <p className="text-[10px] leading-relaxed" style={{ color: "#5A7368" }}>
          Fase 2: portero titular real (confirmado por ESPN, cruzado con sus stats oficiales de NHL) + Over/Under con Poisson. Pendiente: backtesting real guardado en Supabase, para medir qué tan certero es el modelo — igual que ya existe en MLB y NFL.
        </p>
      </div>
    </div>
  );
}

// ---- Tabla de posiciones real ----
// ---- Picks del día: lo mejor de lo mejor, de los partidos pendientes de HOY ----
function DayPicks() {
  const [picks, setPicks] = useState(null);
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    setStatus("cargando");
    (async () => {
      const [gamesData, standingsData] = await Promise.all([
        fetch(`${BACKEND_URL}/api/nhl/games`).then((r) => r.json()).catch(() => ({ games: [] })),
        fetch(`${BACKEND_URL}/api/nhl/standings`).then((r) => r.json()).catch(() => ({ teams: [] })),
      ]);
      if (cancelled) return;
      const map = buildNhlTeamMap(standingsData);
      // Solo temporada regular, todavía sin empezar — pretemporada no mide
      // la fuerza real del equipo titular (mismo principio por el que no
      // se guarda para backtesting).
      const pendingGames = (gamesData.games || []).filter((g) => g.gameState === "FUT" && !g.isPreseason);

      // Probabilidad de ganar de cada partido pendiente — con el mismo
      // cálculo (incluido el portero titular) que el detalle del juego.
      const teamPicks = [];
      for (const g of pendingGames) {
        const home = map[g.homeCode];
        const away = map[g.awayCode];
        if (!home || !away) continue;
        // Mismo portero (y mismo historial vs rival) que usa el detalle del
        // juego, para que el % sea idéntico en todas las pantallas.
        const gameDateET = new Date(g.startTimeUTC).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        let gl = home.fullName && away.fullName
          ? await fetch(`${BACKEND_URL}/api/nhl/goalies/${g.homeCode}/${g.awayCode}?date=${gameDateET}&homeName=${encodeURIComponent(home.fullName)}&awayName=${encodeURIComponent(away.fullName)}`)
              .then((r) => r.json()).catch(() => null)
          : null;
        gl = await enrichGoaliesVs(gl, g.homeCode, g.awayCode);
        const r = await computeNhlWinProb(home, away, gl);
        if (r) {
          const homeWins = r.prob >= 0.5;
          teamPicks.push({
            team: homeWins ? g.homeName : g.awayName,
            teamCode: homeWins ? g.homeCode : g.awayCode,
            opponent: homeWins ? g.awayName : g.homeName,
            prob: Math.max(r.prob, 1 - r.prob),
          });
        }
      }
      teamPicks.sort((a, b) => b.prob - a.prob);

      // Goleadores: consulta a todos los equipos con partido pendiente hoy.
      const codesInvolved = new Set();
      for (const g of pendingGames) {
        codesInvolved.add(g.homeCode);
        codesInvolved.add(g.awayCode);
      }
      const perTeamResults = await Promise.all(
        [...codesInvolved].map(async (code) => {
          const d = await fetch(`${BACKEND_URL}/api/nhl/team/${code}/skater-stats`).then((r) => r.json()).catch(() => ({ players: [] }));
          return (d.players || []).map((p) => ({ ...p, team: code }));
        })
      );
      const allPlayers = perTeamResults.flat();
      // Desempate fijo (más partidos jugados, luego nombre) para que el
      // orden no cambie entre pantallas con empates exactos.
      const topBy = (key) =>
        [...allPlayers]
          .sort((a, b) => b[key] - a[key] || b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name))
          .slice(0, 3);
      const topGoal = topBy("goalProbability");
      const topAssist = topBy("assistProbability");
      const topPoint = topBy("pointProbability");
      const topTeams = teamPicks.slice(0, 3);

      // Guarda automáticamente equipo y gol para Precisión.
      if (topTeams.length > 0 || topGoal.length > 0 || topAssist.length > 0 || topPoint.length > 0) {
        const pickDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        const nhlPicks = [
          ...topTeams.map((t) => ({ pick_date: pickDate, pick_type: "team", player_id: null, player_name: t.team, team_code: t.teamCode, predicted_prob: t.prob })),
          ...topGoal.map((p) => ({ pick_date: pickDate, pick_type: "goal", player_id: p.id || null, player_name: p.name, team_code: p.team || "", predicted_prob: p.goalProbability })),
          ...topAssist.map((p) => ({ pick_date: pickDate, pick_type: "assist", player_id: p.id || null, player_name: p.name, team_code: p.team || "", predicted_prob: p.assistProbability })),
          ...topPoint.map((p) => ({ pick_date: pickDate, pick_type: "point", player_id: p.id || null, player_name: p.name, team_code: p.team || "", predicted_prob: p.pointProbability })),
        ];
        fetch(`${BACKEND_URL}/api/nhl/picks/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ picks: nhlPicks }),
        }).catch(() => {});
      }

      if (!cancelled) {
        setPicks({ topTeams, topGoal, topAssist, topPoint });
        setStatus("listo");
      }
    })().catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  if (status === "cargando") return <p className="text-[11px]" style={{ color: "#8FA599" }}>Calculando con datos reales de los partidos de hoy… puede tardar un poco.</p>;
  if (status === "error") return <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>;
  if (!picks) return null;

  // Mismo formato que los Picks del día de MLB: una tarjeta por categoría,
  // número en círculo, nombre, detalle debajo y porcentaje grande al final.
  const sections = [
    {
      header: "Picks del día · equipos",
      title: "Mayor probabilidad de ganar hoy",
      items: picks.topTeams.map((t) => ({ key: t.teamCode, name: t.team, sub: `le gana a ${t.opponent}`, pct: t.prob })),
      note: "Mismo modelo de probabilidad que el detalle de cada juego (Log5 sobre % de puntos + ventaja de casa + forma + casa/ruta + fuerza de calendario). El portero titular real de cada juego se ve al entrar a su detalle.",
    },
    {
      header: "Picks del día · jugadores",
      title: "Mayor probabilidad de gol hoy",
      items: picks.topGoal.map((p) => ({ key: p.id, name: p.name, sub: `${p.team} · ${p.position} · ${p.goals} G en ${p.gamesPlayed} PJ`, pct: p.goalProbability })),
    },
    {
      header: "Picks del día · jugadores",
      title: "Mayor probabilidad de asistencia hoy",
      items: picks.topAssist.map((p) => ({ key: p.id, name: p.name, sub: `${p.team} · ${p.position} · ${p.assists} A en ${p.gamesPlayed} PJ`, pct: p.assistProbability })),
    },
    {
      header: "Picks del día · jugadores",
      title: "Mayor probabilidad de punto hoy (gol o asistencia)",
      items: picks.topPoint.map((p) => ({ key: p.id, name: p.name, sub: `${p.team} · ${p.position} · ${p.points} PTS en ${p.gamesPlayed} PJ`, pct: p.pointProbability })),
    },
  ];
  const playerNote = 'Probabilidad real de al menos 1 por juego, con la tasa real de cada jugador esta temporada (Poisson), entre los jugadores de TODOS los equipos con partido pendiente hoy. "PJ" = partidos jugados: con pocos, el número es ruidoso y mejora conforme avance la temporada.';

  return (
    <div className="space-y-6">
      {sections.map((sec) => (
        <div key={sec.title} className="rounded-xl border p-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
          <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>{sec.header}</div>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>{sec.title}</h2>
          {sec.items.length === 0 ? (
            <p className="text-[11px]" style={{ color: "#8FA599" }}>Sin datos suficientes hoy — puede ser que no haya juegos de temporada regular pendientes.</p>
          ) : (
            <div className="space-y-3">
              {sec.items.map((item, i) => (
                <div key={item.key + "-" + i} className="flex items-center gap-3 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: i === 0 ? "#FFB627" : "#1F3D30" }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0" style={{ background: "#1A362A", color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold" style={{ color: "#EDEAE1" }}>{item.name}</div>
                    <div className="text-[11px]" style={{ color: "#8FA599" }}>{item.sub}</div>
                  </div>
                  <div className="text-xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                    {(item.pct * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] mt-3 leading-relaxed" style={{ color: "#5A7368" }}>{sec.note || playerNote}</p>
        </div>
      ))}
    </div>
  );
}

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
function WinProbAccuracy({ since }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");
  const [checking, setChecking] = useState(false);

  const load = () => {
    setStatus("cargando");
    fetch(`${BACKEND_URL}/api/nhl/predictions/accuracy${since ? `?since=${since}` : ""}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setStatus("listo"); })
      .catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, [since]);

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
function OverUnderAccuracy({ since }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");
  const [checking, setChecking] = useState(false);

  const load = () => {
    setStatus("cargando");
    fetch(`${BACKEND_URL}/api/nhl/overunder/accuracy${since ? `?since=${since}` : ""}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setStatus("listo"); })
      .catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, [since]);

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

function NhlBacktestStatus() {
  const [s, setS] = useState(null);
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/nhl/backtest-status`).then((r) => r.json()).then(setS).catch(() => setS(null));
  }, []);
  if (!s || !s.predictions) return null;
  const rows = [
    ["Ganador", s.predictions],
    ["Over/Under", s.overunder],
    ["Picks del día", s.picks],
  ];
  return (
    <div className="rounded-xl border p-4 mb-4" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <div className="text-[11px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Estado del guardado</div>
      <div className="space-y-1">
        {rows.map(([label, t]) => (
          <div key={label} className="flex items-center justify-between text-[11px]">
            <span style={{ color: "#C9D6CD" }}>{label}</span>
            {t && t.exists ? (
              <span style={{ color: "#8FA599" }}>{t.total} guardadas · {t.pending} esperando resultado</span>
            ) : (
              <span style={{ color: "#C8393E", fontWeight: 700 }}>tabla no existe en Supabase</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NhlPicksAccuracy({ since }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");
  const [checking, setChecking] = useState(false);

  const load = () => {
    setStatus("cargando");
    fetch(`${BACKEND_URL}/api/nhl/picks/accuracy${since ? `?since=${since}` : ""}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setStatus("listo"); })
      .catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, [since]);

  const checkNow = () => {
    setChecking(true);
    fetch(`${BACKEND_URL}/api/nhl/picks/check`, { method: "POST" })
      .then((r) => r.json())
      .then(() => { load(); setChecking(false); })
      .catch(() => setChecking(false));
  };

  return (
    <div className="rounded-xl border p-6 mb-4" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>Backtesting real — Picks del día</div>
      <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>¿Qué tan certeros son los Picks del día?</h2>

      <button
        onClick={checkNow}
        disabled={checking}
        className="mb-4 px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: "#1A362A", color: "#FFB627", border: "1px solid #2A4D3B", opacity: checking ? 0.6 : 1 }}
      >
        {checking ? "Revisando resultados reales…" : "Revisar picks de días anteriores"}
      </button>

      {status === "cargando" && <p className="text-[11px]" style={{ color: "#8FA599" }}>Cargando…</p>}
      {status === "error" && <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>}

      {status === "listo" && data && (!data.teams || !data.goal) && (
        <p className="text-[13px]" style={{ color: "#8FA599" }}>
          No se pudo leer la precisión de Picks del día todavía (puede ser que falte crear la tabla nhl_daily_picks en Supabase). El resto de la app sigue funcionando normal.
        </p>
      )}

      {status === "listo" && data && data.teams && data.goal && (() => {
        const tiles = [
          ["Equipos", data.teams],
          ["Gol", data.goal],
          ["Asistencia", data.assist || { accuracy: null, total: 0 }],
          ["Punto", data.point || { accuracy: null, total: 0 }],
        ];
        const anyData = tiles.some(([, t]) => t.total > 0);
        if (!anyData) {
          return (
            <p className="text-[13px]" style={{ color: "#8FA599" }}>
              Todavía no hay picks comparados contra resultados reales. La app guarda los picks del día automáticamente — vuelve en unos días y presiona "Revisar picks de días anteriores". Gol, asistencia y punto se revisan contra el boxscore real de la NHL.
            </p>
          );
        }
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {tiles.map(([label, t]) => (
              <div key={label} className="p-3.5 rounded-lg border text-center" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
                <div className="text-2xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                  {t.accuracy != null ? `${(t.accuracy * 100).toFixed(1)}%` : "—"}
                </div>
                <div className="text-[10px] tracking-widest uppercase mt-1" style={{ color: "#8FA599" }}>{label} ({t.total})</div>
              </div>
            ))}
          </div>
        );
      })()}

      {status === "listo" && data && data.teams && data.goal && data.recent && data.recent.length > 0 && (
        <>
          <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Últimos picks comparados</div>
          <div className="space-y-1.5">
            {data.recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] p-2 rounded" style={{ background: "#12281E" }}>
                <span style={{ color: "#C9D6CD" }}>{r.date} · {r.name} <span style={{ color: "#8FA599" }}>({r.team})</span></span>
                <span style={{ color: "#8FA599" }}>{r.type === "team" ? "Equipo" : r.type === "assist" ? "Asistencia" : r.type === "point" ? "Punto" : "Gol"} · {(r.prob * 100).toFixed(0)}%</span>
                <span style={{ color: r.success ? "#3FC97A" : "#C8393E", fontWeight: 700 }}>{r.success ? "✓ acertó" : "✗ falló"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Selector "medir desde": la precisión se calcula solo con predicciones de
// esa fecha en adelante (útil después de un cambio de modelo, para no mezclar
// predicciones viejas con las nuevas). Vacío = todo el historial.
function SinceBar({ since, setSince }) {
  return (
    <div className="rounded-xl border p-4 mb-4 flex flex-wrap items-center gap-2" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <span className="text-[11px] tracking-widest uppercase" style={{ color: "#8FA599" }}>Medir desde</span>
      <input
        type="date"
        value={since}
        onChange={(e) => setSince(e.target.value)}
        className="px-2 py-1 rounded-lg text-xs"
        style={{ background: "#12281E", color: "#EDEAE1", border: "1px solid #1F3D30" }}
      />
      <button
        onClick={() => setSince("")}
        className="px-3 py-1 rounded-lg text-xs font-semibold"
        style={{ background: since ? "#12281E" : "#FFB627", color: since ? "#8FA599" : "#0B1F17", border: "1px solid " + (since ? "#1F3D30" : "#FFB627") }}
      >
        Todo el historial
      </button>
    </div>
  );
}

export default function DiamondStatsNHL({ onBackToMenu }) {
  const [since, setSince] = useState("");
  const [view, setView] = useState("juegos"); // "juegos" | "picks" | "posiciones" | "precision"
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
              onClick={() => setView("picks")}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: view === "picks" ? "#FFB627" : "#12281E",
                color: view === "picks" ? "#0B1F17" : "#8FA599",
                border: "1px solid " + (view === "picks" ? "#FFB627" : "#1F3D30"),
              }}
            >
              Picks del día
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
        ) : view === "picks" ? (
          <DayPicks />
        ) : view === "posiciones" ? (
          <Standings />
        ) : (
          <>
            <NhlBacktestStatus />
            <SinceBar since={since} setSince={setSince} />
            <WinProbAccuracy since={since} />
            <NhlPicksAccuracy since={since} />
            <OverUnderAccuracy since={since} />
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
