import React, { useState, useEffect } from "react";

const BACKEND_URL = "https://diamond-stats-backend.onrender.com";

// ---------------------------------------------------------------------------
// Modelo NBA — Fase 2 (lesiones reales + Over/Under). Cada número sale de una fuente real o de una
// constante citada; lo que es un peso subjetivo se dice explícitamente.
// ---------------------------------------------------------------------------

// Log5 (Bill James): probabilidad de que A le gane a B según su fuerza.
function log5(pctA, pctB) {
  const a = Math.min(0.99, Math.max(0.01, pctA));
  const b = Math.min(0.99, Math.max(0.01, pctB));
  const num = a * (1 - b);
  return num / (num + b * (1 - a));
}

// Expectativa Pitagórica de NBA: exponente 13.91, el ajuste empírico de
// Daryl Morey (Basketball-Reference usa ~14). Puntos a favor / en contra
// predicen mejor el rendimiento que el récord de victorias.
// Fuente: https://nbaanalytic.com/articles/pythagorean-expectation-nba-standings.html
const NBA_PYTHAG_EXP = 13.91;
function pythagPct(pf, pa) {
  if (!pf || !pa) return null;
  const a = Math.pow(pf, NBA_PYTHAG_EXP);
  const b = Math.pow(pa, NBA_PYTHAG_EXP);
  return a / (a + b);
}

// Conversión de puntos de margen a probabilidad: la desviación estándar
// del margen de un juego NBA es ~12 puntos (Wayne Winston,
// https://waynewinston.com/wordpress/p_2333/), así que cerca del 50% cada
// punto vale ≈ 0.399/12 ≈ 3.3% de probabilidad (densidad normal estándar
// en 0 dividida entre 12).
const NBA_PROB_PER_POINT = 0.399 / 12;

// Segundo juego de un back-to-back: ~1.2 puntos peor que el promedio del
// equipo — promedio de las 6 temporadas reportadas en
// https://thedatajocks.com/the-stats-behind-back-to-back-nba-games/
// (1.9, 2.0, 0.5, 0.6, 1.5, 0.5). Fuente secundaria y varía mucho por
// temporada (la propia fuente atribuye gran parte a descanso de
// titulares): es una ESTIMACIÓN, no una constante exacta.
const NBA_B2B_POINTS = 1.2;

const pct = (w, l) => (w + l > 0 ? w / (w + l) : null);

// CDF normal estándar (aproximación Abramowitz-Stegun 7.1.26).
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// Over/Under: total esperado = promedio de (puntos a favor del equipo +
// puntos en contra del rival) para cada lado. La LÍNEA es la del propio
// modelo (total esperado redondeado a .5), NO la de una casa de apuestas.
// La desviación del total sale de los juegos reales completados de cada
// equipo (totalSD del backend). No se ajusta por lesiones: no hay un
// coeficiente citado de cuánto bajan el total, así que no se inventa.
function computeNbaOverUnder(home, away, homeSchedule, awaySchedule) {
  if (!home?.avgPointsFor || !home?.avgPointsAgainst || !away?.avgPointsFor || !away?.avgPointsAgainst) return null;
  const sdH = homeSchedule?.totalSD;
  const sdA = awaySchedule?.totalSD;
  if (sdH == null || sdA == null) return null;
  const expectedTotal = (home.avgPointsFor + away.avgPointsAgainst) / 2 + (away.avgPointsFor + home.avgPointsAgainst) / 2;
  const sd = Math.sqrt((sdH * sdH + sdA * sdA) / 2);
  if (!sd) return null;
  const line = Math.round(expectedTotal - 0.5) + 0.5;
  const overProb = 1 - normCdf((line - expectedTotal) / sd);
  return { expectedTotal, line, sd, overProb };
}

async function computeNbaWinProb(home, away, ctx) {
  if (!home || !away) return null;
  const leagueHome = ctx.leagueHomeWinPct; // MEDIDA de los 30 equipos reales

  // Fuerza base: Expectativa Pitagórica (si falta, el % real de victorias).
  const homePyth = pythagPct(home.avgPointsFor, home.avgPointsAgainst);
  const awayPyth = pythagPct(away.avgPointsFor, away.avgPointsAgainst);
  const homeStrength = homePyth ?? home.winPct ?? 0.5;
  const awayStrength = awayPyth ?? away.winPct ?? 0.5;
  const baseProb = log5(homeStrength, awayStrength);

  // Ventaja de casa de la liga: porcentaje de victorias de local medido de
  // los récords casa/ruta reales de los 30 equipos, menos 0.5.
  const homeAdvantage = leagueHome != null ? leagueHome - 0.5 : 0;

  // Forma reciente (últimos 10). Peso 0.10 = decisión SUBJETIVA (no hay
  // coeficiente citado); se medirá con el backtesting.
  const homeL10 = pct(home.l10Wins, home.l10Losses);
  const awayL10 = pct(away.l10Wins, away.l10Losses);
  const formAdj = homeL10 != null && awayL10 != null ? (homeL10 - awayL10) * 0.1 : 0;

  // Casa/ruta específico de cada equipo, DESCONTANDO lo que ya cuenta la
  // ventaja de casa de la liga (si no, se contaría dos veces). Peso 0.5 =
  // decisión subjetiva.
  const homeHomePct = pct(home.homeWins, home.homeLosses);
  const awayRoadPct = pct(away.roadWins, away.roadLosses);
  let homeRoadAdj = 0;
  if (homeHomePct != null && awayRoadPct != null && home.winPct != null && away.winPct != null && leagueHome != null) {
    const homeSpecific = (homeHomePct - home.winPct) - (leagueHome - 0.5);
    const awaySpecific = (awayRoadPct - away.winPct) + (leagueHome - 0.5);
    homeRoadAdj = (homeSpecific - awaySpecific) * 0.5;
  }

  // Fuerza de calendario real (rivales enfrentados). Peso 0.3 = decisión
  // subjetiva, igual que en NHL.
  const [homeSchedule, awaySchedule, injuries] = await Promise.all([
    fetch(`${BACKEND_URL}/api/nba/team/${home.id}/schedule-analysis`).then((r) => r.json()).catch(() => null),
    fetch(`${BACKEND_URL}/api/nba/team/${away.id}/schedule-analysis`).then((r) => r.json()).catch(() => null),
    fetch(`${BACKEND_URL}/api/nba/game-injuries?homeId=${home.id}&awayId=${away.id}`).then((r) => r.json()).catch(() => null),
  ]);
  let sosAdj = 0;
  if (homeSchedule?.avgOpponentWinPct != null && awaySchedule?.avgOpponentWinPct != null) {
    sosAdj = (homeSchedule.avgOpponentWinPct - awaySchedule.avgOpponentWinPct) * 0.3;
  }

  // Descanso real: ¿jugó ayer? (calendario real de ESPN, solo temporada regular)
  const b2bPenalty = NBA_B2B_POINTS * NBA_PROB_PER_POINT;
  const homeB2B = !!ctx.homeB2B;
  const awayB2B = !!ctx.awayB2B;
  const restAdj = (awayB2B ? b2bPenalty : 0) - (homeB2B ? b2bPenalty : 0);

  // Lesiones reales (ESPN): puntos por 100 posesiones que pierde cada equipo
  // según su valor estimado (BPM ≈ 0.53×(PER−15)), minutos y estado. Es una
  // ESTIMACIÓN con pesos propios (ver nota del panel). Tope ±30% por
  // seguridad ante datos raros.
  const homeLost = injuries?.home?.lostPoints ?? 0;
  const awayLost = injuries?.away?.lostPoints ?? 0;
  const injuryAdj = Math.max(-0.3, Math.min(0.3, (awayLost - homeLost) * NBA_PROB_PER_POINT));

  const prob = Math.min(0.92, Math.max(0.08, baseProb + homeAdvantage + formAdj + homeRoadAdj + sosAdj + restAdj + injuryAdj));
  const overUnder = computeNbaOverUnder(home, away, homeSchedule, awaySchedule);
  return { prob, baseProb, homePyth, awayPyth, homeAdvantage, formAdj, homeRoadAdj, sosAdj, restAdj, injuryAdj, homeB2B, awayB2B, homeSchedule, awaySchedule, injuries, overUnder };
}

const etDate = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const isScheduled = (g) => g.status === "STATUS_SCHEDULED";

async function loadContext() {
  const standings = await fetch(`${BACKEND_URL}/api/nba/standings`).then((r) => r.json()).catch(() => ({ teams: [] }));
  const byId = Object.fromEntries((standings.teams || []).map((t) => [String(t.id), t]));
  const byCode = Object.fromEntries((standings.teams || []).map((t) => [t.code, t]));
  return { standings, byId, byCode, leagueHomeWinPct: standings.leagueHomeWinPct ?? null };
}

// Guarda automáticamente la predicción de cada juego de temporada regular
// que TODAVÍA NO empieza, sin necesidad de abrir su detalle. Una
// predicción hecha con el juego ya en curso o terminado contaminaría la
// precisión. El servidor ignora duplicados (la primera predicción gana).
async function predictAndSaveGame(game, base, restByDate) {
  if (game.isPreseason || !isScheduled(game)) return;
  const home = base.byId[String(game.homeId)] || base.byCode[game.homeCode];
  const away = base.byId[String(game.awayId)] || base.byCode[game.awayCode];
  if (!home || !away) return;
  const date = etDate(game.startTime);
  const played = restByDate[date] || [];
  const r = await computeNbaWinProb(home, away, {
    leagueHomeWinPct: base.leagueHomeWinPct,
    homeB2B: played.includes(game.homeCode),
    awayB2B: played.includes(game.awayCode),
  });
  if (!r) return;
  await fetch(`${BACKEND_URL}/api/nba/predictions/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_date: date, home_code: game.homeCode, away_code: game.awayCode, home_win_prob: r.prob }),
  }).catch(() => {});
  await saveOverUnder(date, game, r.overUnder);
}

function saveOverUnder(date, game, ou) {
  if (!ou) return Promise.resolve();
  return fetch(`${BACKEND_URL}/api/nba/overunder/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_date: date, home_code: game.homeCode, away_code: game.awayCode, line: ou.line, over_prob: ou.overProb, expected_total: ou.expectedTotal }),
  }).catch(() => {});
}

async function fetchRest(date) {
  const d = await fetch(`${BACKEND_URL}/api/nba/rest?date=${date}`).then((r) => r.json()).catch(() => null);
  return d?.playedYesterday || [];
}

// ---- Lista de juegos de hoy ----
function GamesList({ onSelect }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/nba/games`)
      .then((r) => r.json())
      .then(async (d) => {
        if (cancelled) return;
        setData(d);
        setStatus("listo");
        const pending = (d.games || []).filter((g) => !g.isPreseason && isScheduled(g));
        if (pending.length > 0) {
          const base = await loadContext();
          const date = d.date;
          const restByDate = { [date]: await fetchRest(date) };
          await Promise.all(pending.map((g) => predictAndSaveGame(g, base, restByDate).catch(() => {})));
        }
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  if (status === "cargando") return <p className="text-[11px]" style={{ color: "#8FA599" }}>Buscando juegos de hoy…</p>;
  if (status === "error") return <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>;
  if (!data || !data.games || data.games.length === 0) return <p className="text-[11px]" style={{ color: "#8FA599" }}>No hay juegos programados hoy.</p>;

  return (
    <div className="mb-6">
      <div className="text-[11px] tracking-widest uppercase mb-3" style={{ color: "#8FA599" }}>Juegos de hoy</div>
      <div className="flex flex-col gap-2">
        {data.games.map((g) => {
          const final = g.completed;
          const live = g.status === "STATUS_IN_PROGRESS";
          return (
            <button
              key={g.id}
              onClick={() => onSelect(g)}
              className="w-full text-left p-3.5 rounded-xl border transition-transform hover:scale-[1.01]"
              style={{ background: "#0F251C", borderColor: "#1F3D30" }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] tracking-widest uppercase" style={{ color: "#8FA599" }}>
                  {new Date(g.startTime).toLocaleTimeString("es", { hour: "numeric", minute: "2-digit", hour12: true })}
                  {g.venue ? ` · ${g.venue}` : ""}
                </span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: g.isPreseason ? "#3D2A12" : final ? "#1A362A" : "#12281E",
                    color: g.isPreseason ? "#FFB627" : final ? "#3FC97A" : "#8FA599",
                  }}
                >
                  {g.isPreseason ? "Pretemporada" : final ? "Final" : live ? "En vivo" : "Programado"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: final && g.awayWinner ? "#FFB627" : "#EDEAE1" }}>{g.awayName}</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, monospace" }}>{g.awayScore ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: final && g.homeWinner ? "#FFB627" : "#EDEAE1" }}>{g.homeName}</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, monospace" }}>{g.homeScore ?? "—"}</span>
              </div>
              {g.isPreseason && (
                <div className="text-[10px] mt-1.5" style={{ color: "#FFB627" }}>
                  Juego de pretemporada — los titulares juegan pocos minutos o descansan, así que el resultado no refleja la fuerza real del equipo.
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Detalle completo de un partido ----
function GameDetail({ game, onBack }) {
  const [info, setInfo] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    setStatus("cargando");
    (async () => {
      const base = await loadContext();
      if (cancelled) return;
      const home = base.byId[String(game.homeId)] || base.byCode[game.homeCode];
      const away = base.byId[String(game.awayId)] || base.byCode[game.awayCode];
      setInfo({ home, away, seasonDisplayName: base.standings.seasonDisplayName, leagueHomeWinPct: base.leagueHomeWinPct });
      if (!home || !away) { setStatus("listo"); return; }

      const date = etDate(game.startTime);
      const played = game.isPreseason ? [] : await fetchRest(date);
      if (cancelled) return;
      const r = await computeNbaWinProb(home, away, {
        leagueHomeWinPct: base.leagueHomeWinPct,
        homeB2B: played.includes(game.homeCode),
        awayB2B: played.includes(game.awayCode),
      });
      if (cancelled) return;
      setResult(r);
      setStatus("listo");

      // Solo antes de que empiece el juego y fuera de pretemporada.
      if (!game.isPreseason && isScheduled(game) && r) {
        fetch(`${BACKEND_URL}/api/nba/predictions/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game_date: date, home_code: game.homeCode, away_code: game.awayCode, home_win_prob: r.prob }),
        }).catch(() => {});
        saveOverUnder(date, game, r.overUnder);
      }
    })();
    return () => { cancelled = true; };
  }, [game.homeId, game.awayId, game.startTime, game.isPreseason]);

  const fmt = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
  const sgn = (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

  return (
    <div className="mb-6">
      <button onClick={onBack} className="text-[11px] font-semibold mb-3 flex items-center gap-1" style={{ color: "#FFB627" }}>
        ← Volver a juegos de hoy
      </button>

      <div className="p-4 rounded-xl border" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
        <div className="text-sm font-bold mb-1" style={{ color: "#EDEAE1" }}>{game.awayName} @ {game.homeName}</div>
        {game.venue && <div className="text-[11px] mb-3" style={{ color: "#8FA599" }}>{game.venue}</div>}

        {game.isPreseason && (
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#3D2A12", borderColor: "#5A3D1A" }}>
            <p className="text-[11px]" style={{ color: "#FFB627" }}>
              Juego de pretemporada — los titulares juegan pocos minutos o descansan, así que la probabilidad de abajo (basada en la temporada de referencia {info?.seasonDisplayName || "anterior"}) es mucho menos confiable que en temporada regular. Úsala con cautela.
            </p>
          </div>
        )}

        {status === "cargando" && (
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <p className="text-[11px]" style={{ color: "#8FA599" }}>Calculando probabilidad real (puntos a favor/en contra, forma, casa/ruta, calendario, descanso)…</p>
          </div>
        )}

        {status === "listo" && !result && (
          <p className="text-[11px]" style={{ color: "#8FA599" }}>No hay récord real todavía para uno de los dos equipos.</p>
        )}

        {status === "listo" && result && (() => {
          const homeP = result.prob;
          const awayP = 1 - homeP;
          return (
            <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
                Probabilidad de ganar (Log5 sobre Expectativa Pitagórica + ventaja de casa medida + forma reciente + récord casa/ruta + fuerza de calendario + descanso + lesiones)
              </div>
              <div className="space-y-2.5 mb-2">
                {[{ name: game.awayName, p: awayP, fav: awayP >= homeP }, { name: game.homeName, p: homeP, fav: homeP > awayP }].map((row) => (
                  <div key={row.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span style={{ color: row.fav ? "#FFB627" : "#C9D6CD" }}>{row.name}</span>
                      <span className="font-bold tabular-nums" style={{ color: row.fav ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{(row.p * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full" style={{ background: "#1A362A" }}>
                      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${(row.p * 100).toFixed(1)}%`, background: row.fav ? "#FFB627" : "#5A7368" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] leading-relaxed space-y-0.5" style={{ color: "#5A7368" }}>
                <div>Fuerza base (Pitagórica, local {fmt(result.homePyth)} · visitante {fmt(result.awayPyth)}) → {fmt(result.baseProb)} para el local.</div>
                <div>
                  Ventaja de casa medida de la liga: {result.homeAdvantage ? sgn(result.homeAdvantage) : "—"} · Forma reciente: {sgn(result.formAdj)} · Casa/ruta propio: {sgn(result.homeRoadAdj)} · Calendario: {sgn(result.sosAdj)} · Descanso: {sgn(result.restAdj)} · Lesiones: {sgn(result.injuryAdj || 0)}
                </div>
                {(result.homeB2B || result.awayB2B) && (
                  <div style={{ color: "#FFB627" }}>
                    Segundo juego en noches seguidas: {[result.awayB2B ? game.awayName : null, result.homeB2B ? game.homeName : null].filter(Boolean).join(" y ")}.
                  </div>
                )}
                {(result.homeSchedule?.avgOpponentWinPct != null || result.awaySchedule?.avgOpponentWinPct != null) && (
                  <div>
                    Rivales enfrentados (% de victorias promedio): {game.awayName} {fmt(result.awaySchedule?.avgOpponentWinPct)} · {game.homeName} {fmt(result.homeSchedule?.avgOpponentWinPct)}.
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {status === "listo" && result?.overUnder && (() => {
          const ou = result.overUnder;
          const overP = ou.overProb;
          return (
            <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
                Over/Under de puntos totales (línea del modelo: {ou.line})
              </div>
              <div className="space-y-2.5 mb-2">
                {[{ name: `Over ${ou.line}`, p: overP, fav: overP >= 0.5 }, { name: `Under ${ou.line}`, p: 1 - overP, fav: overP < 0.5 }].map((row) => (
                  <div key={row.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span style={{ color: row.fav ? "#FFB627" : "#C9D6CD" }}>{row.name}</span>
                      <span className="font-bold tabular-nums" style={{ color: row.fav ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{(row.p * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full" style={{ background: "#1A362A" }}>
                      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${(row.p * 100).toFixed(1)}%`, background: row.fav ? "#FFB627" : "#5A7368" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] leading-relaxed" style={{ color: "#5A7368" }}>
                Total esperado {ou.expectedTotal.toFixed(1)} (puntos a favor de cada equipo con los puntos que permite el rival) · desviación real de los totales {ou.sd.toFixed(1)}. La línea es la del modelo, no la de una casa de apuestas; no se ajusta por lesiones.
              </div>
            </div>
          );
        })()}

        {status === "listo" && result?.injuries && (() => {
          const inj = result.injuries;
          const sides = [
            { label: game.awayName, d: inj.away },
            { label: game.homeName, d: inj.home },
          ];
          const none = sides.every((x) => !x.d || (x.d.players || []).length === 0);
          return (
            <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Lesiones reales (ESPN)</div>
              {none ? (
                <p className="text-[11px]" style={{ color: "#8FA599" }}>ESPN no reporta lesionados para estos dos equipos ahora mismo.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sides.map(({ label, d }) => (
                    <div key={label}>
                      <div className="text-[11px] font-semibold mb-1" style={{ color: "#EDEAE1" }}>
                        {label}{d && d.lostPoints > 0 ? ` · −${d.lostPoints.toFixed(1)} pts/100 pos. estimados` : ""}
                      </div>
                      {(d?.players || []).length === 0 && <div className="text-[11px]" style={{ color: "#8FA599" }}>Sin lesionados reportados.</div>}
                      {(d?.players || []).map((pl, i) => (
                        <div key={i} className="text-[11px] mb-1" style={{ color: "#8FA599" }}>
                          <span style={{ color: pl.status === "Out" ? "#C8393E" : "#FFB627", fontWeight: 700 }}>{pl.status === "Out" ? "Fuera" : "Dudoso"}</span>{" "}
                          <span style={{ color: "#C9D6CD" }}>{pl.name}</span>{pl.position ? ` (${pl.position})` : ""}
                          {pl.injury ? ` · ${pl.injury}` : ""}{pl.returnDate ? ` · regreso est. ${pl.returnDate}` : ""}
                          {pl.hasStats
                            ? ` · ${pl.avgMinutes?.toFixed(1)} min · ${pl.avgPoints?.toFixed(1)} pts · PER ${pl.per?.toFixed(1)} · valor perdido ≈ ${pl.lostPoints.toFixed(1)}`
                            : " · sin estadísticas suficientes (<20 juegos), no cuenta en el ajuste"}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {info?.home && info?.away && (
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
              Récord real temporada de referencia {info.seasonDisplayName || ""}
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px]" style={{ color: "#8FA599" }}>
              {[{ label: game.awayName, t: info.away }, { label: game.homeName, t: info.home }].map(({ label, t }) => (
                <div key={label}>
                  <div className="font-semibold mb-1" style={{ color: "#EDEAE1" }}>{label}</div>
                  <div>{t.wins}-{t.losses} · {fmt(t.winPct)}</div>
                  <div>{t.avgPointsFor?.toFixed(1)} pts a favor · {t.avgPointsAgainst?.toFixed(1)} en contra ({t.differential != null ? (t.differential >= 0 ? "+" : "") + t.differential.toFixed(1) : "—"})</div>
                  <div>Casa {t.homeWins}-{t.homeLosses} · Ruta {t.roadWins}-{t.roadLosses}</div>
                  <div>Últimos 10: {t.l10Wins}-{t.l10Losses} · Racha {t.streak || "—"}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] leading-relaxed" style={{ color: "#5A7368" }}>
          Lesiones: el valor de cada jugador es una ESTIMACIÓN — BPM ≈ 0.53×(PER−15) (escala de Basketball-Reference, reemplazo = −2), proporcional a sus minutos (min/48) y con peso 1.0 si está Fuera y 0.5 si es Dudoso (este último es subjetivo). Solo cuentan jugadores con 20+ juegos. Cada punto por 100 posesiones perdido ≈ 3.3% de probabilidad. No hay alineación confirmada todavía. Pesos subjetivos (se evaluarán con el backtesting): forma reciente 0.10, casa/ruta propio 0.5, calendario 0.3. El efecto de back-to-back (~1.2 puntos) es una estimación de fuente secundaria.
        </p>
      </div>
    </div>
  );
}

// ---- Picks del día (mismo formato que MLB/NHL) ----
// Equipos: mismo modelo que el detalle de cada juego. Jugadores: frecuencia
// REAL de la temporada (dobles-dobles ÷ juegos), de los jugadores de los
// equipos con juego pendiente hoy, sin los reportados "Fuera" por ESPN.
function DayPicks() {
  const [picks, setPicks] = useState(null);
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gamesData = await fetch(`${BACKEND_URL}/api/nba/games`).then((r) => r.json()).catch(() => ({ games: [] }));
      if (cancelled) return;
      const date = gamesData.date;
      const pending = (gamesData.games || []).filter((g) => !g.isPreseason && isScheduled(g));
      if (pending.length === 0) { setPicks({ none: true }); setStatus("listo"); return; }

      const base = await loadContext();
      const played = await fetchRest(date);
      const teamPicks = [];
      for (const g of pending) {
        const home = base.byId[String(g.homeId)] || base.byCode[g.homeCode];
        const away = base.byId[String(g.awayId)] || base.byCode[g.awayCode];
        if (!home || !away) continue;
        const r = await computeNbaWinProb(home, away, {
          leagueHomeWinPct: base.leagueHomeWinPct,
          homeB2B: played.includes(g.homeCode),
          awayB2B: played.includes(g.awayCode),
        });
        if (!r) continue;
        const homeWins = r.prob >= 0.5;
        teamPicks.push({
          team: homeWins ? g.homeName : g.awayName,
          teamCode: homeWins ? g.homeCode : g.awayCode,
          opponent: homeWins ? g.awayName : g.homeName,
          prob: Math.max(r.prob, 1 - r.prob),
        });
      }
      teamPicks.sort((a, b) => b.prob - a.prob);

      const teamsToday = [];
      for (const g of pending) {
        teamsToday.push({ id: g.homeId, code: g.homeCode }, { id: g.awayId, code: g.awayCode });
      }
      const perTeam = await Promise.all(
        teamsToday.map(async (t) => {
          const d = await fetch(`${BACKEND_URL}/api/nba/team/${t.id}/players`).then((r) => r.json()).catch(() => ({ players: [] }));
          return (d.players || []).map((p) => ({ ...p, team: t.code }));
        })
      );
      if (cancelled) return;
      const eligible = perTeam.flat().filter((p) => p.hasStats && p.status !== "Out");
      const topBy = (key) =>
        eligible
          .filter((p) => p[key] != null && p[key] > 0)
          .sort((a, b) => b[key] - a[key] || b.gamesPlayed - a.gamesPlayed || (a.name || "").localeCompare(b.name || ""))
          .slice(0, 3);
      const topTeams = teamPicks.slice(0, 3);
      const topDD = topBy("doubleDoubleProb");
      const topTD = topBy("tripleDoubleProb");
      // Rebotes / asistencias: promedio REAL por juego de la temporada (no una
      // probabilidad: no hay distribución verificada para convertirlo).
      const topAvg = (key) =>
        [...eligible]
          .filter((p) => p[key] != null)
          .sort((a, b) => b[key] - a[key] || b.gamesPlayed - a.gamesPlayed || (a.name || "").localeCompare(b.name || ""))
          .slice(0, 3);
      const topPts = topAvg("avgPoints");
      const topReb = topAvg("avgRebounds");
      const topAst = topAvg("avgAssists");

      // Registro REAL juego por juego (temporada regular, solo juegos donde
      // jugó) de los 9 candidatos: la probabilidad de llegar a un umbral es la
      // fracción de esos juegos en que lo logró. Umbral = promedio redondeado;
      // se muestran también ±2.
      const candidates = [...new Map([...topPts, ...topReb, ...topAst].map((p) => [p.id, p])).values()];
      const gv = {};
      await Promise.all(
        candidates.map(async (p) => {
          const d = await fetch(`${BACKEND_URL}/api/nba/player/${p.id}/game-values?season=${p.season}`).then((r) => r.json()).catch(() => null);
          if (d?.values && d.games >= 20) gv[p.id] = d.values;
        })
      );
      const freq = (arr, t) => arr.filter((v) => v >= t).length / arr.length;
      const withLadder = (list, avgKey, vKey) =>
        list.map((p) => {
          const arr = gv[p.id]?.[vKey];
          if (!arr) return { ...p, ladder: null };
          const t = Math.max(1, Math.round(p[avgKey]));
          return {
            ...p,
            ladder: { t, games: arr.length, main: freq(arr, t), lo: { t: Math.max(1, t - 2), p: freq(arr, Math.max(1, t - 2)) }, hi: { t: t + 2, p: freq(arr, t + 2) } },
          };
        });
      const ptsList = withLadder(topPts, "avgPoints", "pts");
      const rebList = withLadder(topReb, "avgRebounds", "reb");
      const astList = withLadder(topAst, "avgAssists", "ast");

      if (topTeams.length || topDD.length || topTD.length) {
        const rows = [
          ...topTeams.map((t) => ({ pick_date: date, pick_type: "team", player_id: null, player_name: t.team, team_code: t.teamCode, predicted_prob: t.prob })),
          ...topDD.map((p) => ({ pick_date: date, pick_type: "dd", player_id: p.id, player_name: p.name, team_code: p.team, predicted_prob: p.doubleDoubleProb })),
          ...topTD.map((p) => ({ pick_date: date, pick_type: "td", player_id: p.id, player_name: p.name, team_code: p.team, predicted_prob: p.tripleDoubleProb })),
          ...[["pts", ptsList], ["reb", rebList], ["ast", astList]].flatMap(([type, list]) =>
            list.filter((p) => p.ladder).map((p) => ({ pick_date: date, pick_type: type, player_id: p.id, player_name: p.name, team_code: p.team, predicted_prob: p.ladder.main, threshold: p.ladder.t }))
          ),
        ];
        fetch(`${BACKEND_URL}/api/nba/picks/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ picks: rows }),
        }).catch(() => {});
      }

      if (!cancelled) { setPicks({ topTeams, topDD, topTD, ptsList, rebList, astList }); setStatus("listo"); }
    })().catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  if (status === "cargando") return <p className="text-[11px]" style={{ color: "#8FA599" }}>Calculando con datos reales de los partidos de hoy… puede tardar un poco.</p>;
  if (status === "error") return <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>;
  if (!picks) return null;
  if (picks.none) {
    return (
      <p className="text-[13px]" style={{ color: "#8FA599" }}>
        No hay juegos de temporada regular pendientes hoy. Los picks se calculan solo para temporada regular (la pretemporada no mide la fuerza real y no se guarda para precisión).
      </p>
    );
  }

  const fmtDD = (p) => `${p.team} · ${p.position || "—"} · ${p.avgPoints?.toFixed(1)} pts, ${p.avgRebounds?.toFixed(1)} reb, ${p.avgAssists?.toFixed(1)} ast en ${p.gamesPlayed} PJ${p.season ? ` (temporada ${p.season - 1}-${String(p.season).slice(2)})` : ""}${p.status === "Day-To-Day" ? " · DUDOSO" : ""}`;
  const subAvg = (p) => `${p.team} · ${p.position || "—"} · ${p.avgMinutes?.toFixed(1)} min por juego · ${p.gamesPlayed} PJ${p.season ? ` (temporada ${p.season - 1}-${String(p.season).slice(2)})` : ""}${p.status === "Day-To-Day" ? " · DUDOSO" : ""}`;
  const avgNote = 'Los 3 con mejor promedio de la temporada entre equipos con juego hoy (sin los "Fuera"; 20+ juegos). El porcentaje grande es la frecuencia REAL con que llegó al umbral (su promedio redondeado) en los juegos que jugó de la temporada regular; también se muestra el umbral ±2. No se ajusta por rival ni por los minutos de hoy.';
  const sections = [
    {
      header: "Picks del día · equipos",
      title: "Mayor probabilidad de ganar hoy",
      items: picks.topTeams.map((t) => ({ key: t.teamCode, name: t.team, sub: `le gana a ${t.opponent}`, pct: t.prob })),
      note: "Mismo modelo que el detalle de cada juego (Log5 sobre Expectativa Pitagórica + ventaja de casa + forma + casa/ruta + calendario + descanso + lesiones reales).",
    },
    {
      header: "Picks del día · jugadores",
      title: "Mayor probabilidad de doble-doble hoy",
      items: picks.topDD.map((p) => ({ key: p.id, name: p.name, sub: fmtDD(p), pct: p.doubleDoubleProb })),
    },
    {
      header: "Picks del día · jugadores",
      title: "Mayor probabilidad de triple-doble hoy",
      items: picks.topTD.map((p) => ({ key: p.id, name: p.name, sub: fmtDD(p), pct: p.tripleDoubleProb })),
    },
    ...[
      ["Puntos", picks.ptsList, "avgPoints", "pts", "puntos"],
      ["Rebotes", picks.rebList, "avgRebounds", "reb", "rebotes"],
      ["Asistencias", picks.astList, "avgAssists", "ast", "asistencias"],
    ].map(([label, list, avgKey, short, word]) => ({
      header: "Picks del día · jugadores",
      title: `${label}: los 3 que más promedian hoy`,
      items: list.map((p) => ({
        key: p.id,
        name: p.ladder ? `${p.name} · ${p.ladder.t}+ ${word}` : p.name,
        sub: p.ladder
          ? `${p[avgKey].toFixed(1)} ${short} por juego · ${p.ladder.lo.t}+ en ${(p.ladder.lo.p * 100).toFixed(0)}% · ${p.ladder.hi.t}+ en ${(p.ladder.hi.p * 100).toFixed(0)}% de sus ${p.ladder.games} juegos · ${p.team}${p.status === "Day-To-Day" ? " · DUDOSO" : ""}`
          : `${p[avgKey].toFixed(1)} ${short} por juego · ${p.team} (sin registro juego por juego suficiente)`,
        pct: p.ladder ? p.ladder.main : null,
        display: p.ladder ? null : `${p[avgKey].toFixed(1)}`,
      })),
      note: avgNote,
    })),
  ];
  const playerNote = 'Probabilidad = frecuencia REAL de la temporada (dobles-dobles ÷ juegos jugados), de los jugadores de equipos con juego hoy, sin los reportados "Fuera" por ESPN (con 20+ juegos). No se ajusta por el rival ni por los minutos de hoy. "Dudoso" = ESPN lo lista Day-To-Day.';

  return (
    <div className="space-y-6">
      {sections.map((sec) => (
        <div key={sec.title} className="rounded-xl border p-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
          <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>{sec.header}</div>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>{sec.title}</h2>
          {sec.items.length === 0 ? (
            <p className="text-[11px]" style={{ color: "#8FA599" }}>Sin datos suficientes hoy.</p>
          ) : (
            <div className="space-y-3">
              {sec.items.map((item, i) => (
                <div key={item.key + "-" + i} className="flex items-center gap-3 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: i === 0 ? "#FFB627" : "#1F3D30" }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0" style={{ background: "#1A362A", color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>{i + 1}</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold" style={{ color: "#EDEAE1" }}>{item.name}</div>
                    <div className="text-[11px]" style={{ color: "#8FA599" }}>{item.sub}</div>
                  </div>
                  <div className="text-xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>{item.display || `${(item.pct * 100).toFixed(1)}%`}</div>
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

// ---- Tabla de posiciones real ----
function Standings() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/nba/standings`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setData(d); setStatus("listo"); } })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  if (status === "cargando") return <p className="text-[11px]" style={{ color: "#8FA599" }}>Consultando tabla de posiciones real…</p>;
  if (status === "error" || !data) return <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>;

  const teams = data.teams || [];
  const east = teams.filter((t) => /east/i.test(t.conference || ""));
  const west = teams.filter((t) => /west/i.test(t.conference || ""));

  const renderTable = (list, label) => (
    <div className="mb-6">
      <div className="text-[11px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>{label}</div>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#1F3D30" }}>
        {list.map((t, i) => (
          <div
            key={t.id}
            className="flex items-center justify-between px-3 py-2 text-[11px]"
            style={{ background: i % 2 === 0 ? "#0F251C" : "#12281E", borderTop: i > 0 ? "1px solid #1F3D30" : "none" }}
          >
            <span style={{ color: "#EDEAE1" }}>{t.name}</span>
            <span className="tabular-nums" style={{ color: "#8FA599", fontFamily: "ui-monospace, monospace" }}>
              {t.wins}-{t.losses} · {(t.winPct * 100).toFixed(1)}% · {t.differential != null ? (t.differential >= 0 ? "+" : "") + t.differential.toFixed(1) : "—"} · {t.streak || "—"}
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
        Récord real, % de victorias, diferencial de puntos por juego y racha — vía la API pública de ESPN. Temporada mostrada: {data.seasonDisplayName || "—"}. Si la 2026-27 todavía no tiene juegos de temporada regular, esto es la última temporada completa como referencia honesta.
      </p>
    </div>
  );
}

// ---- Estado del guardado + precisión real ----
function NbaBacktestStatus() {
  const [s, setS] = useState(null);
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/nba/backtest-status`).then((r) => r.json()).then(setS).catch(() => setS(null));
  }, []);
  if (!s || !s.predictions) return null;
  const t = s.predictions;
  return (
    <div className="rounded-xl border p-4 mb-4" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <div className="text-[11px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Estado del guardado</div>
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: "#C9D6CD" }}>Ganador</span>
        {t.exists ? (
          <span style={{ color: "#8FA599" }}>{t.total} guardadas · {t.pending} esperando resultado</span>
        ) : (
          <span style={{ color: "#C8393E", fontWeight: 700 }}>tabla no existe en Supabase</span>
        )}
      </div>
      {s.picks && (
        <div className="flex items-center justify-between text-[11px] mt-1.5">
          <span style={{ color: "#C9D6CD" }}>Picks del día</span>
          {s.picks.exists ? (
            <span style={{ color: "#8FA599" }}>{s.picks.total} guardadas · {s.picks.pending} esperando resultado</span>
          ) : (
            <span style={{ color: "#C8393E", fontWeight: 700 }}>tabla no existe en Supabase</span>
          )}
        </div>
      )}
      {s.overunder && (
        <div className="flex items-center justify-between text-[11px] mt-1.5">
          <span style={{ color: "#C9D6CD" }}>Over/Under</span>
          {s.overunder.exists ? (
            <span style={{ color: "#8FA599" }}>{s.overunder.total} guardadas · {s.overunder.pending} esperando resultado</span>
          ) : (
            <span style={{ color: "#C8393E", fontWeight: 700 }}>tabla no existe en Supabase</span>
          )}
        </div>
      )}
    </div>
  );
}

function WinProbAccuracy() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");
  const [checking, setChecking] = useState(false);

  const load = () => {
    setStatus("cargando");
    fetch(`${BACKEND_URL}/api/nba/predictions/accuracy`)
      .then((r) => r.json())
      .then((d) => { setData(d); setStatus("listo"); })
      .catch(() => setStatus("error"));
  };
  useEffect(() => { load(); }, []);

  const checkNow = () => {
    setChecking(true);
    fetch(`${BACKEND_URL}/api/nba/predictions/check`, { method: "POST" })
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
          Todavía no hay predicciones comparadas contra resultados reales. La app guarda sola la predicción de cada juego de temporada regular que aún no empieza al abrir "Juegos de hoy" (la pretemporada no cuenta). Vuelve cuando haya juegos reales terminados y presiona "Revisar predicciones de días anteriores".
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
              const fav = r.homeWinProb >= 0.5 ? r.home : r.away;
              const correct = fav === r.actualWinner;
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

function OverUnderAccuracy() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");
  const [checking, setChecking] = useState(false);

  const load = () => {
    setStatus("cargando");
    fetch(`${BACKEND_URL}/api/nba/overunder/accuracy`)
      .then((r) => r.json())
      .then((d) => { setData(d); setStatus("listo"); })
      .catch(() => setStatus("error"));
  };
  useEffect(() => { load(); }, []);

  const checkNow = () => {
    setChecking(true);
    fetch(`${BACKEND_URL}/api/nba/overunder/check`, { method: "POST" })
      .then((r) => r.json())
      .then(() => { load(); setChecking(false); })
      .catch(() => setChecking(false));
  };

  return (
    <div className="rounded-xl border p-6 mb-4" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>Backtesting real — Over/Under</div>
      <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>¿Acierta los totales?</h2>
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

      {status === "listo" && data && !data.totalChecked && (
        <p className="text-[13px]" style={{ color: "#8FA599" }}>Todavía no hay Over/Under comparados contra totales reales (solo se guardan juegos de temporada regular que no han empezado).</p>
      )}

      {status === "listo" && data && data.totalChecked > 0 && (
        <>
          <div className="p-3.5 rounded-lg border text-center mb-4" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-2xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>{(data.accuracy * 100).toFixed(1)}%</div>
            <div className="text-[10px] tracking-widest uppercase mt-1" style={{ color: "#8FA599" }}>Acertó Over/Under ({data.totalChecked} juegos, sin contar empates con la línea)</div>
          </div>
          <div className="space-y-1.5">
            {(data.recent || []).map((r, i) => {
              const pick = r.overProb >= 0.5 ? "over" : "under";
              const push = r.actualResult === "push";
              const correct = pick === r.actualResult;
              return (
                <div key={i} className="flex items-center justify-between text-[11px] p-2 rounded" style={{ background: "#12281E" }}>
                  <span style={{ color: "#C9D6CD" }}>{r.date} · {r.away} @ {r.home}</span>
                  <span style={{ color: "#8FA599" }}>{pick === "over" ? "Over" : "Under"} {r.line} ({(Math.max(r.overProb, 1 - r.overProb) * 100).toFixed(0)}%)</span>
                  <span style={{ color: push ? "#8FA599" : correct ? "#3FC97A" : "#C8393E", fontWeight: 700 }}>{push ? "= push" : correct ? "✓" : "✗"} ({r.actualTotalPoints})</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function NbaPicksAccuracy() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");
  const [checking, setChecking] = useState(false);

  const load = () => {
    setStatus("cargando");
    fetch(`${BACKEND_URL}/api/nba/picks/accuracy`)
      .then((r) => r.json())
      .then((d) => { setData(d); setStatus("listo"); })
      .catch(() => setStatus("error"));
  };
  useEffect(() => { load(); }, []);

  const checkNow = () => {
    setChecking(true);
    fetch(`${BACKEND_URL}/api/nba/picks/check`, { method: "POST" })
      .then((r) => r.json())
      .then(() => { load(); setChecking(false); })
      .catch(() => setChecking(false));
  };

  const tile = (label, t) => (
    <div className="p-3.5 rounded-lg border text-center" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
      <div className="text-2xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
        {t && t.total > 0 ? `${(t.accuracy * 100).toFixed(0)}%` : "—"}
      </div>
      <div className="text-[10px] tracking-widest uppercase mt-1" style={{ color: "#8FA599" }}>{label}</div>
      <div className="text-[10px] mt-0.5" style={{ color: "#5A7368" }}>{t ? t.total : 0} revisados</div>
    </div>
  );

  return (
    <div className="rounded-xl border p-6 mb-4" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>Backtesting real — Picks del día</div>
      <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>¿Aciertan los picks?</h2>
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
      {status === "listo" && data && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {tile("Equipos", data.teams)}
            {tile("Doble-doble", data.dd)}
            {tile("Triple-doble", data.td)}
            {tile("Puntos", data.pts)}
            {tile("Rebotes", data.reb)}
            {tile("Asistencias", data.ast)}
          </div>
          {data.voided > 0 && (
            <p className="text-[10px] mb-3" style={{ color: "#5A7368" }}>{data.voided} picks de jugadores que no jugaron no cuentan ni a favor ni en contra.</p>
          )}
          <div className="space-y-1.5">
            {(data.recent || []).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] p-2 rounded" style={{ background: "#12281E" }}>
                <span style={{ color: "#C9D6CD" }}>{r.date} · {({ team: "Equipo", dd: "Doble-doble", td: "Triple-doble", pts: "Puntos", reb: "Rebotes", ast: "Asistencias" })[r.type] || r.type} · {r.name}</span>
                <span style={{ color: "#8FA599" }}>{(r.prob * 100).toFixed(0)}%</span>
                <span style={{ color: r.success ? "#3FC97A" : "#C8393E", fontWeight: 700 }}>{r.success ? "✓" : "✗"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function DiamondStatsNBA({ onBackToMenu }) {
  const [view, setView] = useState("juegos"); // "juegos" | "posiciones" | "precision"
  const [selectedGame, setSelectedGame] = useState(null);

  const tabs = [
    ["juegos", "Juegos de hoy"],
    ["picks", "Picks del día"],
    ["posiciones", "Tabla de posiciones"],
    ["precision", "Precisión"],
  ];

  return (
    <div className="min-h-screen w-full" style={{ background: "#0B1F17" }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: "#C8393E" }} />
            <span className="text-[11px] tracking-[0.25em] uppercase" style={{ color: "#8FA599", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
              NBA Analytics — Fase 3
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
          <div className="flex gap-2 mb-6 flex-wrap">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  background: view === id ? "#FFB627" : "#12281E",
                  color: view === id ? "#0B1F17" : "#8FA599",
                  border: "1px solid " + (view === id ? "#FFB627" : "#1F3D30"),
                }}
              >
                {label}
              </button>
            ))}
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
            <NbaBacktestStatus />
            <WinProbAccuracy />
            <OverUnderAccuracy />
            <NbaPicksAccuracy />
          </>
        )}

        {!selectedGame && (
          <p className="text-[10px] mt-8 leading-relaxed" style={{ color: "#5A7368" }}>
            Fase 2: probabilidad real con Log5 sobre la Expectativa Pitagórica (exponente 13.91) + ventaja de casa medida + forma reciente + casa/ruta + calendario + back-to-back + lesiones reales de ESPN, más Over/Under, con backtesting real guardado. Fase 3: Picks del día con equipos, doble-doble, triple-doble y puntos/rebotes/asistencias por umbral (frecuencias reales juego por juego). Pendiente: alineación confirmada. Ahora mismo solo hay pretemporada (no se guarda para precisión), así que los récords usados son los de la última temporada completa.
          </p>
        )}
      </div>
    </div>
  );
}
