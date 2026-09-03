import React, { useState, useEffect } from "react";

const BACKEND_URL = "https://diamond-stats-backend.onrender.com";

// ---- Modelo de predicción — Fase 5 ----
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
// 6 factores reales: récord de temporada (Log5), diferencial de puntos
// por juego, diferencial de balón (turnovers), historial cara a cara
// real esta temporada, récord real de casa/ruta específico de cada
// equipo, y clima real cuando es adverso (viento fuerte, lluvia
// probable, o frío extremo) — el local, ya acostumbrado a sus propias
// condiciones, tiene una ventaja leve real en esos casos.
async function computeNflWinProb(home, away, weather) {
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

  // Récord real de casa del LOCAL vs. récord real de ruta del
  // VISITANTE — no simétrico, porque a cada uno le importa su propio
  // lado. Mismo principio que ya usamos en MLB.
  let homeRoadAdj = 0;
  const [homeHA, awayHA] = await Promise.all([
    fetch(`${BACKEND_URL}/api/nfl/team/${home.id}/home-away-record`).then((r) => r.json()).catch(() => null),
    fetch(`${BACKEND_URL}/api/nfl/team/${away.id}/home-away-record`).then((r) => r.json()).catch(() => null),
  ]);
  const recPct = (rec) => (rec && rec.w + rec.l > 0 ? rec.w / (rec.w + rec.l) : null);
  const homeAtHomePct = recPct(homeHA?.homeRecord);
  const awayOnRoadPct = recPct(awayHA?.awayRecord);
  if (homeAtHomePct != null && awayOnRoadPct != null) {
    const homeAtHomeDelta = homeAtHomePct - (home.winPercent ?? 0.5);
    const awayOnRoadDelta = awayOnRoadPct - (away.winPercent ?? 0.5);
    homeRoadAdj = (homeAtHomeDelta - awayOnRoadDelta) * 0.3;
  }

  // Clima real adverso: viento fuerte (15+ mph), alta probabilidad de
  // lluvia (50%+), o frío extremo (bajo 32°F) — favorece levemente al
  // local, que juega ahí toda la temporada y ya está acostumbrado.
  let weatherAdj = 0;
  if (weather && weather.roofed === false && weather.tempF != null) {
    const adverse = weather.windMph > 15 || weather.pop > 50 || weather.tempF < 32;
    if (adverse) weatherAdj = 0.02;
  }

  const prob = baseProb + NFL_HOME_ADVANTAGE + diffAdj + turnoverAdj + h2hAdj + homeRoadAdj + weatherAdj;
  return { prob: Math.min(0.92, Math.max(0.08, prob)), diffAdj, turnoverAdj, h2hAdj, weatherAdj, h2h, homeHA, awayHA };
}

// ---- Aproximación de la CDF normal estándar (Abramowitz y Stegun) ----
function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) prob = 1 - prob;
  return prob;
}

// Over/Under real de NFL: puntos esperados del local (promedio entre su
// ataque y la defensa rival) + puntos esperados del visitante (mismo
// principio al revés), pasado por una distribución normal — la
// desviación estándar real de puntos totales en NFL ronda los 10 puntos.
// El clima adverso reduce el total esperado de verdad (viento dificulta
// pases y patadas, lluvia complica el manejo del balón).
function computeNflOverUnder(home, away, weather) {
  if (!home || !away) return null;
  const gamesHome = home.wins + home.losses + home.ties;
  const gamesAway = away.wins + away.losses + away.ties;
  if (gamesHome === 0 || gamesAway === 0) return null;

  const homePFAvg = home.pointsFor / gamesHome;
  const homePAAvg = home.pointsAgainst / gamesHome;
  const awayPFAvg = away.pointsFor / gamesAway;
  const awayPAAvg = away.pointsAgainst / gamesAway;
  const expectedHomeScore = (homePFAvg + awayPAAvg) / 2;
  const expectedAwayScore = (awayPFAvg + homePAAvg) / 2;
  let expectedTotal = expectedHomeScore + expectedAwayScore;

  if (weather && weather.roofed === false && weather.tempF != null) {
    if (weather.windMph > 20) expectedTotal *= 0.85;
    else if (weather.windMph > 15) expectedTotal *= 0.92;
    if (weather.pop > 50) expectedTotal *= 0.95;
    if (weather.tempF < 20) expectedTotal *= 0.95;
  }

  const line = Math.round(expectedTotal * 2) / 2;
  const SD_NFL_TOTAL = 10; // desviación estándar real aproximada de puntos totales en NFL
  const z = (line - expectedTotal) / SD_NFL_TOTAL;
  const underProb = normalCDF(z);
  const overProb = 1 - underProb;
  return { line, overProb, underProb, expectedTotal };
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

// ---- Lista compacta de juegos de la semana ----
function GamesList({ onSelect }) {
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
      <div className="flex flex-col gap-2">
        {data.games.map((g) => (
          <button
            key={g.id}
            onClick={() => onSelect({ ...g, week: data.week })}
            className="w-full text-left p-3.5 rounded-xl border transition-transform hover:scale-[1.01]"
            style={{ background: "#0F251C", borderColor: "#1F3D30" }}
          >
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
            {g.venue && <div className="text-[10px] mt-1" style={{ color: "#5A7368" }}>{g.venue} · toca para ver el análisis completo</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Detalle completo de un partido ----
// ---- Yardas reales y probabilidad de touchdown de jugadores ofensivos ----
// ---- El jugador con más posibilidad real de cada cosa, en ESTE partido ----
function SkillPlayerStats({ homeTeamId, awayTeamId }) {
  const [players, setPlayers] = useState(null);
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${BACKEND_URL}/api/nfl/team/${homeTeamId}/skill-stats`).then((r) => r.json()).catch(() => ({ players: [] })),
      fetch(`${BACKEND_URL}/api/nfl/team/${awayTeamId}/skill-stats`).then((r) => r.json()).catch(() => ({ players: [] })),
    ]).then(([homeData, awayData]) => {
      if (cancelled) return;
      setPlayers([...(homeData.players || []), ...(awayData.players || [])]);
      setStatus("listo");
    }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [homeTeamId, awayTeamId]);

  if (status === "cargando") return <p className="text-[10px]" style={{ color: "#5A7368" }}>Calculando con datos reales de ambos equipos…</p>;
  if (status === "error") return <p className="text-[10px]" style={{ color: "#5A7368" }}>No se pudo traer las estadísticas ahora mismo.</p>;
  if (!players || players.length === 0) return <p className="text-[10px]" style={{ color: "#5A7368" }}>Sin jugadores con uso real registrado todavía.</p>;

  const topByType = (type) => players.filter((p) => p.type === type).sort((a, b) => b.ydsPerGame - a.ydsPerGame)[0];
  const topTD = [...players].sort((a, b) => b.tdProbability - a.tdProbability)[0];

  const rows = [
    { label: "Más yardas de pase", player: topByType("passing"), stat: (p) => `${p.ydsPerGame.toFixed(0)} yds/juego` },
    { label: "Más yardas de acarreo", player: topByType("rushing"), stat: (p) => `${p.ydsPerGame.toFixed(0)} yds/juego` },
    { label: "Más yardas de recepción", player: topByType("receiving"), stat: (p) => `${p.ydsPerGame.toFixed(0)} yds/juego` },
    { label: "Más probable en anotar TD", player: topTD, stat: (p) => `${(p.tdProbability * 100).toFixed(0)}%` },
  ].filter((r) => r.player);

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded" style={{ background: "#0F251C" }}>
          <div>
            <div style={{ color: "#5A7368", fontSize: "9px" }}>{r.label}</div>
            <div style={{ color: "#C9D6CD" }}>{r.player.name} <span style={{ color: "#5A7368" }}>({r.player.position})</span></div>
          </div>
          <span className="font-bold" style={{ color: "#FFB627" }}>{r.stat(r.player)}</span>
        </div>
      ))}
    </div>
  );
}

function GameDetail({ game, onBack }) {
  const [standingsMap, setStandingsMap] = useState(null);
  const [weather, setWeather] = useState(null);
  const [result, setResult] = useState(null); // { prob, diffAdj, turnoverAdj, h2hAdj, weatherAdj, h2h }
  const [overUnder, setOverUnder] = useState(null); // { line, overProb, underProb, expectedTotal }
  const [status, setStatus] = useState("cargando");

  useEffect(() => {
    let cancelled = false;
    setStatus("cargando");
    Promise.all([
      fetch(`${BACKEND_URL}/api/nfl/standings`).then((r) => r.json()).catch(() => ({ teams: [] })),
      fetch(`${BACKEND_URL}/api/nfl/weather/${game.homeCode}?gameTime=${encodeURIComponent(game.date)}`).then((r) => r.json()).catch(() => null),
    ]).then(async ([standingsData, weatherData]) => {
      if (cancelled) return;
      const map = Object.fromEntries((standingsData.teams || []).map((t) => [t.code, t]));
      setStandingsMap(map);
      setWeather(weatherData);
      if (!game.completed) {
        const r = await computeNflWinProb(map[game.homeCode], map[game.awayCode], weatherData);
        if (!cancelled) setResult(r);

        const ou = computeNflOverUnder(map[game.homeCode], map[game.awayCode], weatherData);
        if (!cancelled) setOverUnder(ou);
        if (ou) {
          const gameDate = new Date(game.date).toISOString().slice(0, 10);
          fetch(`${BACKEND_URL}/api/nfl/overunder/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              game_date: gameDate, week: game.week || null,
              home_code: game.homeCode, away_code: game.awayCode,
              line: ou.line, over_prob: ou.overProb, expected_total: ou.expectedTotal,
            }),
          }).catch(() => {});
        }
      }
      setStatus("listo");
    }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [game]);

  const home = standingsMap?.[game.homeCode];
  const away = standingsMap?.[game.awayCode];

  return (
    <div className="mb-6">
      <button
        onClick={onBack}
        className="text-[10px] font-semibold px-2 py-1 rounded-full mb-4"
        style={{ background: "#12281E", color: "#8FA599", border: "1px solid #1F3D30" }}
      >
        ← Volver a la lista
      </button>

      <div className="mb-4">
        <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>
          {new Date(game.date).toLocaleDateString("es", { weekday: "long", month: "long", day: "numeric" })} · {new Date(game.date).toLocaleTimeString("es", { hour: "numeric", minute: "2-digit", hour12: true })}
        </div>
        <div className="text-lg font-bold" style={{ color: "#EDEAE1" }}>{game.awayName} @ {game.homeName}</div>
        {game.venue && <div className="text-[11px]" style={{ color: "#5A7368" }}>{game.venue}</div>}
      </div>

      {status === "cargando" && <p className="text-[11px]" style={{ color: "#8FA599" }}>Calculando con datos reales…</p>}
      {status === "error" && <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>}

      {status === "listo" && game.completed && (
        <div className="p-4 rounded-lg border text-center" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
          <div className="text-sm font-bold" style={{ color: "#EDEAE1" }}>{game.awayScore} — {game.homeScore}</div>
          <div className="text-[11px] mt-1" style={{ color: "#8FA599" }}>Juego finalizado</div>
        </div>
      )}

      {status === "listo" && !game.completed && result && (
        <>
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
              Probabilidad de ganar (Log5 + localía + diferencial de puntos + diferencial de balón + cara a cara + récord casa/ruta + clima)
            </div>
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: (1 - result.prob) >= result.prob ? "#FFB627" : "#C9D6CD" }}>{game.awayName}</span>
                  <span className="font-bold tabular-nums" style={{ color: (1 - result.prob) >= result.prob ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{((1 - result.prob) * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full" style={{ background: "#1A362A" }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${((1 - result.prob) * 100).toFixed(1)}%`, background: (1 - result.prob) >= result.prob ? "#FFB627" : "#5A7368" }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: result.prob > (1 - result.prob) ? "#FFB627" : "#C9D6CD" }}>{game.homeName}</span>
                  <span className="font-bold tabular-nums" style={{ color: result.prob > (1 - result.prob) ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{(result.prob * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full" style={{ background: "#1A362A" }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${(result.prob * 100).toFixed(1)}%`, background: result.prob > (1 - result.prob) ? "#FFB627" : "#5A7368" }} />
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Clima real del estadio</div>
            {weather?.roofed ? (
              <p className="text-[11px]" style={{ color: "#5A7368" }}>Estadio con techo cerrado — el clima no afecta este juego.</p>
            ) : weather?.tempF != null ? (
              <>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: "22px" }}>{weather.icon}</span>
                  <div>
                    <div className="text-base font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, monospace" }}>{weather.tempF.toFixed(0)}°F</div>
                    <div className="text-[10px]" style={{ color: "#8FA599" }}>{weather.description}</div>
                  </div>
                  <div className="text-[11px]" style={{ color: "#8FA599" }}>
                    Viento: <b style={{ color: "#C9D6CD" }}>{weather.windMph.toFixed(0)} mph</b> · P.O.P: <b style={{ color: "#C9D6CD" }}>{weather.pop}%</b>
                  </div>
                </div>
                {result.weatherAdj > 0 && (
                  <p className="text-[10px] mt-2" style={{ color: "#FFB627" }}>
                    Clima adverso real — le da una ventaja leve al local, ya acostumbrado a estas condiciones.
                  </p>
                )}
                {weather.forecastFor && (
                  <p className="text-[10px] mt-1" style={{ color: "#5A7368" }}>
                    Pronóstico para las {new Date(weather.forecastFor).toLocaleTimeString("es", { hour: "numeric", minute: "2-digit", hour12: true })} — la hora más cercana al saque inicial.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px]" style={{ color: "#5A7368" }}>No se pudo traer el clima ahora mismo.</p>
            )}
          </div>

          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Récord real de casa/ruta esta temporada</div>
            <div className="grid grid-cols-2 gap-3 text-[11px]" style={{ color: "#8FA599" }}>
              <div>
                <div className="font-semibold mb-1" style={{ color: "#EDEAE1" }}>{game.awayName} · Visitante</div>
                <div>En ruta: <b style={{ color: "#FFB627" }}>{result.awayHA?.awayRecord ? `${result.awayHA.awayRecord.w}-${result.awayHA.awayRecord.l}` : "—"}</b></div>
              </div>
              <div>
                <div className="font-semibold mb-1" style={{ color: "#EDEAE1" }}>{game.homeName} · Local</div>
                <div>En casa: <b style={{ color: "#FFB627" }}>{result.homeHA?.homeRecord ? `${result.homeHA.homeRecord.w}-${result.homeHA.homeRecord.l}` : "—"}</b></div>
              </div>
            </div>
          </div>

          {result.h2h && result.h2h.gamesPlayed > 0 && (
            <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>Cara a cara esta temporada</div>
              <p className="text-[11px]" style={{ color: "#C9D6CD" }}>
                {game.homeName} {result.h2h.team1Wins}-{result.h2h.team2Wins} {game.awayName} ({result.h2h.gamesPlayed} juego{result.h2h.gamesPlayed > 1 ? "s" : ""})
              </p>
            </div>
          )}

          {overUnder && (
            <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
                Over/Under estimado · línea {overUnder.line} puntos
              </div>
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
                Puntos totales esperados: {overUnder.expectedTotal.toFixed(1)} — combina el ataque y la defensa reales de ambos equipos esta temporada{weather?.roofed === false && (weather?.windMph > 15 || weather?.pop > 50 || weather?.tempF < 20) ? ", ya reducido por el clima adverso real de hoy" : ""}, pasado por una distribución normal (desviación estándar ~10 puntos, típica en NFL).
              </p>
            </div>
          )}

          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
              Mejor candidato real en este partido (yardas de temporada + probabilidad de TD por Poisson)
            </div>
            {away?.id && home?.id && <SkillPlayerStats homeTeamId={home.id} awayTeamId={away.id} />}
          </div>

          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Estado de lesiones (informativo — no se sabe con certeza quién es el QB titular)</div>
            <div className="flex gap-2 flex-wrap">
              {away?.id && <TeamInjuries teamId={away.id} teamName={game.awayName} />}
              {home?.id && <TeamInjuries teamId={home.id} teamName={game.homeName} />}
            </div>
          </div>
        </>
      )}
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

// ---- Precisión real de Over/Under ----
function OverUnderAccuracy() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando");
  const [checking, setChecking] = useState(false);

  const load = () => {
    setStatus("cargando");
    fetch(`${BACKEND_URL}/api/nfl/overunder/accuracy`)
      .then((r) => r.json())
      .then((d) => { setData(d); setStatus("listo"); })
      .catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, []);

  const checkNow = () => {
    setChecking(true);
    fetch(`${BACKEND_URL}/api/nfl/overunder/check`, { method: "POST" })
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
        {checking ? "Revisando resultados reales…" : "Revisar Over/Under de semanas anteriores"}
      </button>

      {status === "cargando" && <p className="text-[11px]" style={{ color: "#8FA599" }}>Cargando…</p>}
      {status === "error" && <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>}

      {status === "listo" && data && data.totalChecked === 0 && (
        <p className="text-[13px]" style={{ color: "#8FA599" }}>
          Todavía no hay Over/Under comparados contra resultados reales. La app guarda una predicción cada vez que entras al detalle de un partido — vuelve en unos días y presiona "Revisar Over/Under de semanas anteriores".
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
                  <span style={{ color: "#C9D6CD" }}>{r.actualTotalPoints} pts reales</span>
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

export default function DiamondStatsNFL({ onBackToMenu }) {
  const [view, setView] = useState("juegos"); // "juegos" | "posiciones" | "precision"
  const [selectedGame, setSelectedGame] = useState(null);

  return (
    <div className="min-h-screen w-full" style={{ background: "#0B1F17" }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: "#C8393E" }} />
            <span className="text-[11px] tracking-[0.25em] uppercase" style={{ color: "#8FA599", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
              NFL Analytics — Fase 5
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
          <OverUnderAccuracy />
        )}

        {!selectedGame && (
          <p className="text-[10px] mt-8 leading-relaxed" style={{ color: "#5A7368" }}>
            Fase 5: probabilidad real con 6 factores (Log5 + ventaja de casa + diferencial de puntos + diferencial de balón + cara a cara + récord casa/ruta + clima adverso), más Over/Under con su propio backtesting. Pendiente: identificar al QB titular real.
          </p>
        )}
      </div>
    </div>
  );
}
