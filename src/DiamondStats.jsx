import React, { useState, useMemo, useEffect } from "react";
import { Search, TrendingUp, TrendingDown, Minus, ChevronRight, Activity } from "lucide-react";

// IDs oficiales de la MLB Stats API — deben coincidir con TEAM_IDS en server.js,
// para poder emparejar la respuesta del backend con nuestros códigos de equipo.
const TEAM_IDS = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113,
  CLE: 114, COL: 115, DET: 116, HOU: 117, KC: 118, LAA: 108, LAD: 119,
  MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, ATH: 133, PHI: 143,
  PIT: 134, SD: 135, SF: 137, SEA: 136, STL: 138, TB: 139, TEX: 140,
  TOR: 141, WSH: 120,
};
const TEAM_ID_TO_CODE = Object.fromEntries(Object.entries(TEAM_IDS).map(([code, id]) => [id, code]));

// ---- Datos reales, temporada 2026 (fuente: MLB.com, al 9-10 de agosto de 2026) ----
// Cubre 29 de los 30 equipos con al menos un bateador real. Solo falta Los
// Angeles Angels: la página oficial nos devolvió repetidamente una versión
// en caché de mayo (muestras de ~45 juegos) en vez de los datos actuales de
// agosto (~115+ juegos) — preferimos dejarlo pendiente antes que mezclar un
// dato de otra fecha con el resto de la temporada.
// Nota: WAR no se incluyó en este pull de datos; el badge se muestra vacío hasta integrarlo.
const PLAYERS = [
  { id: 1, name: "Yordan Alvarez", team: "HOU", pos: "DH", type: "bateador", bats: "L", avg: .325, hr: 35, rbi: 86, obp: .439, slg: .630, ops: 1.069, k_pct: 21.1, trend: "up", ab: 422, h: 137, doubles: 24, triples: 0, g: 116 },
  { id: 2, name: "Shohei Ohtani", team: "LAD", pos: "DH", type: "bateador", bats: "L", avg: .294, hr: 26, rbi: 71, obp: .398, slg: .547, ops: .945, k_pct: 27.3, trend: "up", ab: 411, h: 121, doubles: 22, triples: 2, g: 111 },
  { id: 3, name: "Pete Crow-Armstrong", team: "CHC", pos: "CF", type: "bateador", bats: "L", avg: .287, hr: 26, rbi: 71, obp: .388, slg: .545, ops: .933, k_pct: 31.4, trend: "up", ab: 442, h: 127, doubles: 22, triples: 7, g: 118 },
  { id: 4, name: "James Wood", team: "WSH", pos: "RF", type: "bateador", bats: "L", avg: .265, hr: 30, rbi: 73, obp: .393, slg: .535, ops: .928, k_pct: 35.0, trend: "up", ab: 437, h: 116, doubles: 26, triples: 1, g: 114 },
  { id: 5, name: "Junior Caminero", team: "TB", pos: "3B", type: "bateador", bats: "R", avg: .280, hr: 33, rbi: 71, obp: .372, slg: .551, ops: .923, k_pct: 21.2, trend: "flat", ab: 439, h: 123, doubles: 18, triples: 1, g: 116 },
  { id: 6, name: "CJ Abrams", team: "WSH", pos: "SS", type: "bateador", bats: "L", avg: .286, hr: 28, rbi: 89, obp: .359, slg: .545, ops: .904, k_pct: 25.9, trend: "up", ab: 437, h: 125, doubles: 23, triples: 3, g: 116 },
  { id: 7, name: "Matt Olson", team: "ATL", pos: "1B", type: "bateador", bats: "L", avg: .266, hr: 33, rbi: 71, obp: .343, slg: .547, ops: .890, k_pct: 27.9, trend: "flat", ab: 455, h: 121, doubles: 29, triples: 0, g: 118 },
  { id: 8, name: "Kyle Schwarber", team: "PHI", pos: "DH", type: "bateador", bats: "L", avg: .243, hr: 33, rbi: 64, obp: .362, slg: .518, ops: .880, k_pct: 41.7, trend: "flat", ab: 415, h: 101, doubles: 13, triples: 1, g: 113 },
  { id: 9, name: "Bryce Harper", team: "PHI", pos: "1B", type: "bateador", bats: "L", avg: .256, hr: 25, rbi: 71, obp: .364, slg: .502, ops: .866, k_pct: 25.4, trend: "flat", ab: 418, h: 107, doubles: 22, triples: 3, g: 119 },
  { id: 10, name: "Byron Buxton", team: "MIN", pos: "CF", type: "bateador", bats: "R", avg: .263, hr: 25, rbi: 45, obp: .320, slg: .544, ops: .864, k_pct: 26.6, trend: "flat", ab: 331, h: 87, doubles: 16, triples: 1, g: 82 },
  { id: 11, name: "Rafael Devers", team: "SF", pos: "1B", type: "bateador", bats: "L", avg: .247, hr: 24, rbi: 64, obp: .319, slg: .475, ops: .794, k_pct: 29.6, trend: "down", ab: 442, h: 109, doubles: 27, triples: 1, g: 117 },
  { id: 12, name: "Manny Machado", team: "SD", pos: "3B", type: "bateador", bats: "R", avg: .212, hr: 23, rbi: 70, obp: .298, slg: .421, ops: .719, k_pct: 25.6, trend: "down", ab: 425, h: 90, doubles: 20, triples: 0, g: 115 },
  { id: 13, name: "Hunter Goodman", team: "COL", pos: "C", type: "bateador", bats: "R", avg: .254, hr: 34, rbi: 69, obp: .321, slg: .546, ops: .867, k_pct: 37.3, trend: "up", ab: 405, h: 103, doubles: 16, triples: 0, g: 108 },
  { id: 14, name: "Ben Rice", team: "NYY", pos: "DH", type: "bateador", bats: "L", avg: .257, hr: 32, rbi: 75, obp: .350, slg: .545, ops: .895, k_pct: 28.8, trend: "up", ab: 420, h: 108, doubles: 19, triples: 3, g: 113 },
  { id: 15, name: "Dillon Dingler", team: "DET", pos: "C", type: "bateador", bats: "R", avg: .272, hr: 26, rbi: 80, obp: .337, slg: .525, ops: .862, k_pct: 24.1, trend: "up", ab: 415, h: 113, doubles: 23, triples: 2, g: 109 },
  { id: 16, name: "Miguel Vargas", team: "CWS", pos: "3B", type: "bateador", bats: "L", avg: .235, hr: 24, rbi: 67, obp: .343, slg: .467, ops: .810, k_pct: 21.4, trend: "flat", ab: 430, h: 101, doubles: 26, triples: 1, g: 116 },
  { id: 17, name: "Pete Alonso", team: "BAL", pos: "1B", type: "bateador", bats: "R", avg: .252, hr: 25, rbi: 75, obp: .346, slg: .472, ops: .818, k_pct: 28.6, trend: "flat", ab: 441, h: 111, doubles: 22, triples: 0, g: 118 },
  { id: 18, name: "Brandon Lowe", team: "PIT", pos: "2B", type: "bateador", bats: "L", avg: .253, hr: 25, rbi: 74, obp: .319, slg: .485, ops: .804, k_pct: 31.9, trend: "flat", ab: 439, h: 111, doubles: 25, triples: 1, g: 111 },
  { id: 19, name: "Sal Stewart", team: "CIN", pos: "1B", type: "bateador", bats: "R", avg: .255, hr: 25, rbi: 87, obp: .332, slg: .475, ops: .807, k_pct: 25.2, trend: "flat", ab: 444, h: 113, doubles: 23, triples: 0, g: 117 },
  { id: 20, name: "Kazuma Okamoto", team: "TOR", pos: "3B", type: "bateador", bats: "R", avg: .225, hr: 24, rbi: 70, obp: .299, slg: .429, ops: .728, k_pct: 34.7, trend: "down", ab: 427, h: 96, doubles: 15, triples: 0, g: 116 },
  { id: 21, name: "Willson Contreras", team: "BOS", pos: "1B", type: "bateador", bats: "R", avg: .285, hr: 23, rbi: 70, obp: .394, slg: .533, ops: .927, k_pct: 30.4, trend: "up", ab: 368, h: 105, doubles: 18, triples: 2, g: 107 },
  { id: 22, name: "Shea Langeliers", team: "ATH", pos: "C", type: "bateador", bats: "R", avg: .263, hr: 23, rbi: 51, obp: .332, slg: .497, ops: .829, k_pct: 25.5, trend: "flat", ab: 376, h: 99, doubles: 19, triples: 0, g: 93 },
  { id: 23, name: "Otto Lopez", team: "MIA", pos: "SS", type: "bateador", bats: "R", avg: .318, hr: 9, rbi: 53, obp: .351, slg: .470, ops: .821, k_pct: 14.3, trend: "up", ab: 462, h: 147, doubles: 29, triples: 7, g: 115 },
  { id: 24, name: "Gabriel Moreno", team: "ARI", pos: "C", type: "bateador", bats: "R", avg: .302, hr: 8, rbi: 51, obp: .382, slg: .443, ops: .825, k_pct: 17.3, trend: "up", ab: 318, h: 96, doubles: 21, triples: 0, g: 90 },
  { id: 25, name: "Josh Jung", team: "TEX", pos: "3B", type: "bateador", bats: "R", avg: .294, hr: 9, rbi: 35, obp: .361, slg: .441, ops: .802, k_pct: 20.1, trend: "flat", ab: 354, h: 104, doubles: 23, triples: 1, g: 92 },
  { id: 26, name: "Bobby Witt Jr.", team: "KC", pos: "SS", type: "bateador", bats: "R", avg: .284, hr: 13, rbi: 42, obp: .355, slg: .450, ops: .805, k_pct: 19.2, trend: "flat", ab: 391, h: 111, doubles: 24, triples: 1, g: 100 },
  { id: 27, name: "Jordan Walker", team: "STL", pos: "RF", type: "bateador", bats: "R", avg: .285, hr: 23, rbi: 83, obp: .342, slg: .492, ops: .834, k_pct: 26.7, trend: "up", ab: 445, h: 127, doubles: 23, triples: 0, g: 114 },
  { id: 28, name: "Brice Turang", team: "MIL", pos: "2B", type: "bateador", bats: "L", avg: .272, hr: 16, rbi: 74, obp: .365, slg: .458, ops: .823, k_pct: 28.6, trend: "up", ab: 437, h: 119, doubles: 27, triples: 3, g: 112 },
  { id: 29, name: "Chase DeLauter", team: "CLE", pos: "RF", type: "bateador", bats: "L", avg: .277, hr: 12, rbi: 56, obp: .354, slg: .433, ops: .787, k_pct: 16.4, trend: "up", ab: 379, h: 105, doubles: 21, triples: 1, g: 101 },
  { id: 30, name: "Bo Bichette", team: "NYM", pos: "3B", type: "bateador", bats: "R", avg: .263, hr: 11, rbi: 59, obp: .307, slg: .378, ops: .685, k_pct: 20.0, trend: "flat", ab: 471, h: 124, doubles: 19, triples: 1, g: 118 },
  { id: 31, name: "Julio Rodríguez", team: "SEA", pos: "CF", type: "bateador", bats: "R", avg: .260, hr: 18, rbi: 51, obp: .322, slg: .426, ops: .748, k_pct: 22.6, trend: "up", ab: 420, h: 109, doubles: 16, triples: 0, g: 108 },
];

const TEAMS = ["Todos", ...Object.keys(TEAM_IDS).sort()];

// Convierte los conteos reales de la temporada (H, 2B, 3B, HR sobre AB) en
// probabilidad por turno al bate. Sencillos = hits que no fueron doble,
// triple ni jonrón. Esto reproduce el AVG exacto del jugador (H/AB), solo
// que desglosado por tipo de embasado.
function hitProbabilities(p) {
  const singles = p.h - p.doubles - p.triples - p.hr;
  return {
    hit: (p.h / p.ab) * 100,
    single: (singles / p.ab) * 100,
    double: (p.doubles / p.ab) * 100,
    triple: (p.triples / p.ab) * 100,
    hr: (p.hr / p.ab) * 100,
  };
}

// Ajusta las probabilidades de un bateador según la mano del abridor rival,
// usando la misma brecha de platoon documentada (~30-50 pts de OPS) que ya
// usa el Predictor. IMPORTANTE: esto es un ajuste general de liga aplicado
// a las probabilidades de ESTE jugador — no es su split real personal
// (no tenemos esos datos individuales para los 12), así que es ilustrativo.
// Cruza las estadísticas reales de un bateador con el abridor rival REAL de
// hoy (nombre, mano, ERA — de la base PITCHERS) para generar una
// probabilidad de rendimiento ajustada. Combina dos efectos con respaldo
// estadístico real:
// 1) Platoon (~30-50 pts de OPS según mano, igual que en el Predictor)
// 2) Calidad del pitcher: un ERA por debajo del promedio de liga suprime
//    la ofensiva rival; uno por encima la favorece.
// IMPORTANTE: sigue siendo un ajuste de liga general aplicado a ESTE
// jugador, no su split personal real contra ESE pitcher específico.
function matchupAdjustedProbs(p, pitcher) {
  const base = hitProbabilities(p);
  if (!pitcher) return { ...base, favorable: null, pitcher: null };
  // Si no tenemos su mano de bateo (ej. jugadores traídos en vivo del
  // backend, que todavía no incluye ese dato), no aplicamos platoon —
  // mejor sin ese ajuste que aplicarlo con un supuesto inventado.
  const knownHand = p.bats === "L" || p.bats === "R";
  const favorable = knownHand ? p.bats !== pitcher.hand : null;
  const platoonHitMult = favorable === null ? 1 : favorable ? 1.05 : 0.95;
  const platoonHrMult = favorable === null ? 1 : favorable ? 1.15 : 0.85;
  const platoonDoubleMult = favorable === null ? 1 : favorable ? 1.08 : 0.92;
  const qualityMult = Math.min(1.5, Math.max(0.6, 1 - (LEAGUE_AVG_ERA - pitcher.era) * 0.03));
  const hit = base.hit * platoonHitMult * qualityMult;
  const hr = base.hr * platoonHrMult * qualityMult;
  const double = base.double * platoonDoubleMult * qualityMult;
  const triple = base.triple; // sin evidencia suficiente de split para triples, se deja neutral
  const single = Math.max(0, hit - double - triple - hr);
  return { hit, single, double, triple, hr, favorable, pitcher, qualityMult };
}

// Convierte una probabilidad "por turno al bate" en probabilidad "en algún
// momento del juego", usando sus turnos al bate promedio por juego de la
// temporada real (AB / G). Es la aproximación binomial estándar que se usa
// para calcular, por ejemplo, la probabilidad de una racha de hits:
// P(al menos 1 en el juego) = 1 - (1 - p_por_turno) ^ turnos_por_juego.
function toGameProbability(perAbPct, abPerGame) {
  const p = perAbPct / 100;
  return (1 - Math.pow(1 - p, abPerGame)) * 100;
}

function gameProbabilities(p, pitcher) {
  const perAb = matchupAdjustedProbs(p, pitcher);
  const abPerGame = p.ab / p.g;
  return {
    hit: toGameProbability(perAb.hit, abPerGame),
    single: toGameProbability(perAb.single, abPerGame),
    double: toGameProbability(perAb.double, abPerGame),
    hr: toGameProbability(perAb.hr, abPerGame),
    abPerGame,
    favorable: perAb.favorable,
    pitcher: perAb.pitcher,
  };
}

// ---- Conexión al backend real (desplegado en Render) ----
// Si el backend responde, estos datos se actualizan solos al abrir la app.
// Si no responde (por ejemplo, "dormido" tras inactividad), la app sigue
// funcionando con el snapshot fijo de abajo como respaldo.
const BACKEND_URL = "https://diamond-stats-backend.onrender.com";

// ---- Récords reales de los 30 equipos de MLB, temporada 2026 (fuente: standings al 9 ago 2026) ----
// El % de victorias (wpct) es el insumo del modelo Log5. Este es el snapshot
// de respaldo — se sobreescribe con datos en vivo si el backend responde.
let TEAM_RECORDS = {
  TB: { name: "Tampa Bay Rays", w: 70, l: 46, wpct: .603 },
  NYY: { name: "New York Yankees", w: 66, l: 51, wpct: .564 },
  BOS: { name: "Boston Red Sox", w: 64, l: 52, wpct: .552 },
  CWS: { name: "Chicago White Sox", w: 60, l: 56, wpct: .517 },
  HOU: { name: "Houston Astros", w: 60, l: 58, wpct: .508 },
  TEX: { name: "Texas Rangers", w: 59, l: 58, wpct: .504 },
  MIN: { name: "Minnesota Twins", w: 58, l: 60, wpct: .492 },
  CLE: { name: "Cleveland Guardians", w: 58, l: 60, wpct: .492 },
  DET: { name: "Detroit Tigers", w: 57, l: 60, wpct: .487 },
  BAL: { name: "Baltimore Orioles", w: 56, l: 61, wpct: .479 },
  TOR: { name: "Toronto Blue Jays", w: 56, l: 62, wpct: .475 },
  SEA: { name: "Seattle Mariners", w: 56, l: 62, wpct: .475 },
  KC: { name: "Kansas City Royals", w: 49, l: 69, wpct: .415 },
  ATH: { name: "Athletics", w: 46, l: 71, wpct: .393 },
  LAA: { name: "Los Angeles Angels", w: 45, l: 72, wpct: .385 },
  MIL: { name: "Milwaukee Brewers", w: 73, l: 44, wpct: .624 },
  ATL: { name: "Atlanta Braves", w: 70, l: 47, wpct: .598 },
  LAD: { name: "Los Angeles Dodgers", w: 70, l: 47, wpct: .598 },
  CHC: { name: "Chicago Cubs", w: 68, l: 50, wpct: .576 },
  ARI: { name: "Arizona Diamondbacks", w: 62, l: 56, wpct: .525 },
  PHI: { name: "Philadelphia Phillies", w: 62, l: 56, wpct: .525 },
  SD: { name: "San Diego Padres", w: 61, l: 57, wpct: .517 },
  MIA: { name: "Miami Marlins", w: 59, l: 59, wpct: .500 },
  STL: { name: "St. Louis Cardinals", w: 58, l: 59, wpct: .496 },
  WSH: { name: "Washington Nationals", w: 58, l: 61, wpct: .487 },
  PIT: { name: "Pittsburgh Pirates", w: 58, l: 61, wpct: .487 },
  CIN: { name: "Cincinnati Reds", w: 56, l: 60, wpct: .483 },
  NYM: { name: "New York Mets", w: 51, l: 67, wpct: .432 },
  SF: { name: "San Francisco Giants", w: 49, l: 68, wpct: .419 },
  COL: { name: "Colorado Rockies", w: 46, l: 71, wpct: .393 },
};

// Fórmula Log5 (Bill James) — el estándar de sabermetría para estimar
// la probabilidad de que el equipo A le gane al equipo B, a partir de
// su % de victorias en la temporada.
function log5(pA, pB) {
  const num = pA - pA * pB;
  const den = pA + pB - 2 * pA * pB;
  return den === 0 ? 0.5 : num / den;
}

// ---- Estadios reales de los 30 equipos y su "park factor" de carreras, temporada 2026 ----
// 1.00 = neutral. >1.00 favorece al bateo. <1.00 favorece al pitcheo.
// roofed = techo cerrado/domo fijo, o retráctil que suele jugarse cerrado
// (simplificación razonable para este modelo). windSensitive = parque
// documentado como muy sensible al viento (ej. Wrigley).
const STADIUMS = {
  TB: { park: "Tropicana Field", runFactor: 0.97, roofed: true },
  NYY: { park: "Yankee Stadium", runFactor: 1.04, roofed: false },
  BOS: { park: "Fenway Park", runFactor: 1.08, roofed: false },
  CWS: { park: "Rate Field", runFactor: 1.00, roofed: false },
  HOU: { park: "Daikin Park", runFactor: 1.00, roofed: true },
  TEX: { park: "Globe Life Field", runFactor: 1.06, roofed: true },
  MIN: { park: "Target Field", runFactor: 1.00, roofed: false },
  CLE: { park: "Progressive Field", runFactor: 1.03, roofed: false },
  DET: { park: "Comerica Park", runFactor: 0.95, roofed: false },
  BAL: { park: "Camden Yards", runFactor: 1.10, roofed: false },
  TOR: { park: "Rogers Centre", runFactor: 1.02, roofed: true },
  SEA: { park: "T-Mobile Park", runFactor: 0.94, roofed: false },
  KC: { park: "Kauffman Stadium", runFactor: 1.05, roofed: false },
  ATH: { park: "Sutter Health Park", runFactor: 1.02, roofed: false },
  LAA: { park: "Angel Stadium", runFactor: 1.03, roofed: false },
  MIL: { park: "American Family Field", runFactor: 1.02, roofed: false },
  ATL: { park: "Truist Park", runFactor: 1.00, roofed: false },
  LAD: { park: "Dodger Stadium", runFactor: 0.97, roofed: false },
  CHC: { park: "Wrigley Field", runFactor: 1.05, roofed: false, windSensitive: true },
  ARI: { park: "Chase Field", runFactor: 1.05, roofed: true },
  PHI: { park: "Citizens Bank Park", runFactor: 1.04, roofed: false },
  SD: { park: "Petco Park", runFactor: 0.96, roofed: false },
  MIA: { park: "loanDepot Park", runFactor: 0.94, roofed: true },
  STL: { park: "Busch Stadium", runFactor: 0.98, roofed: false },
  WSH: { park: "Nationals Park", runFactor: 0.99, roofed: false },
  PIT: { park: "PNC Park", runFactor: 0.97, roofed: false },
  CIN: { park: "Great American Ball Park", runFactor: 1.10, roofed: false },
  NYM: { park: "Citi Field", runFactor: 0.92, roofed: false },
  SF: { park: "Oracle Park", runFactor: 0.92, roofed: false },
  COL: { park: "Coors Field", runFactor: 1.20, roofed: false },
};

const HOME_ADVANTAGE = 0.024; // % histórico real de ventaja de jugar de local en MLB (~54% vs 50%)

// ---- Abridores reales por equipo, temporada 2026 (fuente: MLB.com / reportes de rotación, al 10 ago 2026) ----
// Se usa el as/abridor probable más reciente de cada equipo. eraConfirmed:false
// significa que el nombre es real (confirmado como as actual del equipo) pero
// no encontramos su ERA numérico exacto de esta temporada en esta sesión —
// en ese caso el modelo usa el promedio de liga (neutral) para no inventar
// una cifra, y la interfaz lo muestra como "ERA no confirmado".
let PITCHERS = {
  BAL: { name: "Trevor Rogers", hand: "L", era: 4.00, eraConfirmed: false },
  BOS: { name: "Garrett Crochet", hand: "L", era: 4.00, eraConfirmed: false },
  NYY: { name: "Cam Schlittler", hand: "R", era: 2.21, eraConfirmed: true },
  TB: { name: "Ian Seymour", hand: "L", era: 4.27, eraConfirmed: true },
  TOR: { name: "Dylan Cease", hand: "R", era: 2.28, eraConfirmed: true },
  CWS: { name: "Sean Burke", hand: "R", era: 3.08, eraConfirmed: true },
  CLE: { name: "Gavin Williams", hand: "R", era: 3.55, eraConfirmed: true },
  DET: { name: "Casey Mize", hand: "R", era: 4.00, eraConfirmed: false },
  KC: { name: "Michael Wacha", hand: "R", era: 4.00, eraConfirmed: false },
  MIN: { name: "Joe Ryan", hand: "R", era: 3.65, eraConfirmed: true },
  HOU: { name: "Hunter Brown", hand: "R", era: 3.57, eraConfirmed: true },
  LAA: { name: "Reid Detmers", hand: "L", era: 4.12, eraConfirmed: true },
  ATH: { name: "Por confirmar", hand: "R", era: 4.00, eraConfirmed: false },
  SEA: { name: "Logan Gilbert", hand: "R", era: 3.42, eraConfirmed: true },
  TEX: { name: "Jacob deGrom", hand: "R", era: 3.87, eraConfirmed: true },
  ATL: { name: "Chris Sale", hand: "L", era: 2.20, eraConfirmed: true },
  MIA: { name: "Sandy Alcantara", hand: "R", era: 4.00, eraConfirmed: false },
  NYM: { name: "Nolan McLean", hand: "R", era: 3.51, eraConfirmed: true },
  PHI: { name: "Cristopher Sánchez", hand: "L", era: 2.65, eraConfirmed: true },
  WSH: { name: "Cade Cavalli", hand: "R", era: 3.57, eraConfirmed: true },
  CHC: { name: "Kevin Gausman", hand: "R", era: 4.29, eraConfirmed: true },
  CIN: { name: "Chase Burns", hand: "R", era: 2.61, eraConfirmed: true },
  MIL: { name: "Jacob Misiorowski", hand: "R", era: 1.76, eraConfirmed: true },
  PIT: { name: "Paul Skenes", hand: "R", era: 3.96, eraConfirmed: true },
  STL: { name: "Miles Mikolas", hand: "R", era: 4.00, eraConfirmed: false },
  ARI: { name: "Eduardo Rodríguez", hand: "L", era: 4.00, eraConfirmed: false },
  COL: { name: "Por confirmar", hand: "R", era: 4.00, eraConfirmed: false },
  LAD: { name: "Justin Wrobleski", hand: "L", era: 3.31, eraConfirmed: true },
  SD: { name: "Michael King", hand: "R", era: 2.76, eraConfirmed: true },
  SF: { name: "Logan Webb", hand: "R", era: 3.74, eraConfirmed: true },
};

const LEAGUE_AVG_ERA = 4.00; // promedio histórico aproximado de MLB, usado como línea base

// ---- Partido real confirmado para hoy (fuente: calendario oficial MLB, 10 ago 2026) ----
// Houston está de visita en San Francisco en una serie de 3 juegos (10-12 ago) en Oracle Park.
// Es el único cruce entre dos equipos de nuestra base que se juega hoy en la vida real.
const REAL_MATCHUP = { home: "SF", away: "HOU", date: "10 ago 2026", venue: "Oracle Park" };

// Calcula cuánta ventaja aporta un abridor según qué tan por debajo/arriba
// del ERA promedio de liga está — un ERA más bajo que el promedio suprime
// la ofensiva rival y suma a la probabilidad de SU equipo.
function pitcherEdge(era) {
  return (LEAGUE_AVG_ERA - era) * 0.04;
}

// Brecha de OPS real y bien documentada entre enfrentar pitcher de mano
// contraria vs. de la misma mano: ~30-50 puntos de OPS. Usamos 40 (el punto
// medio) como referencia estándar de sabermetría.
const PLATOON_OPS_GAP = 0.040;

// Calcula qué tanta ventaja de "platoon" tiene la ofensiva de un equipo
// contra un abridor de mano conocida, usando SOLO los bateadores estrella
// que tenemos en la base de datos por equipo (no la alineación completa de
// 9), así que es una señal aproximada, no exacta — se lo dejamos explícito
// en la interfaz.
function platoonEdge(teamCode, opposingPitcherHand) {
  if (!opposingPitcherHand) return 0;
  const roster = PLAYERS.filter((p) => p.team === teamCode && (p.bats === "L" || p.bats === "R"));
  if (roster.length === 0) return 0;
  const score = roster.reduce((sum, p) => sum + (p.bats !== opposingPitcherHand ? 1 : -1), 0) / roster.length;
  return score * PLATOON_OPS_GAP * 0.6; // escala moderada y conservadora
}

// Calcula la probabilidad ajustada del equipo LOCAL, sumando al Log5 base
// solo los factores con respaldo estadístico real: localía, parque, clima,
// ventaja de platoon (zurdo/derecho) y calidad real del abridor (ERA) de
// cada equipo. Día/noche y día de la semana se muestran como contexto pero
// NO mueven el número — la evidencia de su efecto a nivel de equipo es
// demasiado débil para justificar un ajuste numérico honesto.
function adjustedHomeProb({ baseProb, stadium, wind, temp, home, away }) {
  let effectiveRunFactor = stadium.runFactor;
  if (!stadium.roofed) {
    if (wind === "out") effectiveRunFactor += stadium.windSensitive ? 0.08 : 0.04;
    if (wind === "in") effectiveRunFactor -= stadium.windSensitive ? 0.08 : 0.04;
    if (temp === "calor") effectiveRunFactor += 0.02;
    if (temp === "frio") effectiveRunFactor -= 0.02;
  }
  const parkAdjustment = (effectiveRunFactor - 1) * 0.15;

  const homePitcher = PITCHERS[home];
  const awayPitcher = PITCHERS[away];
  const homeBattersEdge = platoonEdge(home, awayPitcher.hand); // bateo local vs. abridor visitante
  const awayBattersEdge = platoonEdge(away, homePitcher.hand); // bateo visitante vs. abridor local
  const platoonAdjustment = (homeBattersEdge - awayBattersEdge) * 0.5;

  const pitcherAdjustment = pitcherEdge(homePitcher.era) - pitcherEdge(awayPitcher.era);

  const adjusted = baseProb + HOME_ADVANTAGE + parkAdjustment + platoonAdjustment + pitcherAdjustment;
  return {
    prob: Math.min(0.92, Math.max(0.08, adjusted)),
    effectiveRunFactor, homeBattersEdge, awayBattersEdge,
    homePitcher, awayPitcher, pitcherAdjustment,
  };
}

function TrendIcon({ trend }) {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5" style={{ color: "#FFB627" }} />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5" style={{ color: "#C8393E" }} />;
  return <Minus className="w-3.5 h-3.5" style={{ color: "#8FA599" }} />;
}

function StatBar({ label, value, max, unit = "", color = "#FFB627" }) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className="mb-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px] tracking-widest uppercase" style={{ color: "#8FA599", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>{label}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, 'Courier New', monospace" }}>{value}{unit}</span>
      </div>
      <div className="h-1.5 w-full rounded-full" style={{ background: "#1A362A" }}>
        <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function PlayerCard({ player, onClick, active }) {
  const headline =
    player.type === "bateador"
      ? [`${player.avg.toFixed(3).replace("0.", ".")} AVG`, `${player.hr} HR`, `${player.rbi} RBI`]
      : [`${player.era.toFixed(2)} ERA`, `${player.so} K`, `${player.w}-${player.l}`];

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-lg transition-all duration-200 border"
      style={{
        background: active ? "#17332688" : "#12281E",
        borderColor: active ? "#FFB627" : "#1F3D30",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: "#1F3D30", color: "#FFB627", fontFamily: "ui-monospace, monospace" }}
          >
            {player.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "#EDEAE1" }}>{player.name}</div>
            <div className="text-[11px] tracking-wide" style={{ color: "#8FA599" }}>{player.team} · {player.pos}</div>
          </div>
        </div>
        <TrendIcon trend={player.trend} />
      </div>
      <div className="flex gap-3 mt-1 pl-11">
        {headline.map((h, i) => (
          <span key={i} className="text-[12px] tabular-nums" style={{ color: "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{h}</span>
        ))}
      </div>
    </button>
  );
}

function Predictor({ probablesStatus }) {
  const teamCodes = Object.keys(TEAM_RECORDS);
  const [home, setHome] = useState(REAL_MATCHUP.home);
  const [away, setAway] = useState(REAL_MATCHUP.away);
  const [wind, setWind] = useState("neutro");
  const [temp, setTemp] = useState("templado");
  const [daynight, setDaynight] = useState("noche");
  const [weekday, setWeekday] = useState("Lunes");

  const isRealMatchup = home === REAL_MATCHUP.home && away === REAL_MATCHUP.away;

  const recHome = TEAM_RECORDS[home];
  const recAway = TEAM_RECORDS[away];
  const stadium = STADIUMS[home];

  const baseProb = log5(recHome.wpct, recAway.wpct);
  const {
    prob: homeProb, effectiveRunFactor, homeBattersEdge, awayBattersEdge,
    homePitcher, awayPitcher, pitcherAdjustment,
  } = adjustedHomeProb({ baseProb, stadium, wind, temp, home, away });
  const awayProb = 1 - homeProb;

  return (
    <div className="rounded-xl border p-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-[11px] tracking-widest uppercase" style={{ color: "#8FA599" }}>
          Log5 + localía + parque + clima + platoon + ERA real del abridor
        </div>
        <div className="flex items-center gap-2">
          {probablesStatus === "cargando" && (
            <span className="text-[10px]" style={{ color: "#8FA599" }}>Buscando abridores reales de hoy…</span>
          )}
          {probablesStatus === "en-vivo" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#1A362A", color: "#3FC97A" }}>
              Abridores probables reales de hoy cargados
            </span>
          )}
        {isRealMatchup && (
          <div className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: "#1A362A", color: "#FFB627" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#FFB627" }} />
            PARTIDO REAL DE HOY · {REAL_MATCHUP.date}
          </div>
        )}
        </div>
      </div>
      <h2 className="text-xl font-bold mb-1" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
        ¿Quién gana el enfrentamiento?
      </h2>
      {isRealMatchup && (
        <p className="text-[11px] mb-4" style={{ color: "#8FA599" }}>
          {TEAM_RECORDS[REAL_MATCHUP.away].name} de visita en {STADIUMS[REAL_MATCHUP.home].park} — serie real en curso (10-12 ago).
        </p>
      )}
      {!isRealMatchup && <div className="mb-4" />}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <TeamSelect label="Local" value={home} onChange={setHome} teamCodes={teamCodes} />
        <TeamSelect label="Visitante" value={away} onChange={setAway} teamCodes={teamCodes} />
      </div>

      <div className="p-3.5 rounded-lg border mb-4" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
        <div className="text-[11px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
          Abridores probables (as actual de cada rotación)
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PitcherCard team={away} pitcher={awayPitcher} tag="Visitante" />
          <PitcherCard team={home} pitcher={homePitcher} tag="Local" />
        </div>
        <p className="text-[10px] mt-2.5 leading-relaxed" style={{ color: "#5A7368" }}>
          Ventaja de platoon — bateo {home} vs. este abridor: <b style={{ color: homeBattersEdge >= 0 ? "#FFB627" : "#C8393E" }}>{homeBattersEdge >= 0 ? "+" : ""}{(homeBattersEdge * 100).toFixed(1)}%</b>
          {" · "}bateo {away} vs. este abridor: <b style={{ color: awayBattersEdge >= 0 ? "#FFB627" : "#C8393E" }}>{awayBattersEdge >= 0 ? "+" : ""}{(awayBattersEdge * 100).toFixed(1)}%</b>
          {" · "}peso neto por calidad de abridores (ERA): <b style={{ color: pitcherAdjustment >= 0 ? "#FFB627" : "#C8393E" }}>{pitcherAdjustment >= 0 ? "+" : ""}{(pitcherAdjustment * 100).toFixed(1)}%</b> a favor del local.
          Platoon calculado solo con los bateadores estrella que tenemos por equipo — señal aproximada, no la alineación completa.
        </p>
      </div>

      <div className="p-3.5 rounded-lg border mb-5" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
        <div className="text-[11px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
          {stadium.park} — park factor base {stadium.runFactor.toFixed(2)} {stadium.roofed ? "(techo cerrado)" : ""}
        </div>

        {!stadium.roofed && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <SegmentedControl label="Viento" value={wind} onChange={setWind} options={[["in", "Entra"], ["neutro", "Neutro"], ["out", "Sale"]]} />
            <SegmentedControl label="Temperatura" value={temp} onChange={setTemp} options={[["frio", "Frío"], ["templado", "Templado"], ["calor", "Calor"]]} />
          </div>
        )}
        {stadium.roofed && (
          <p className="text-[11px]" style={{ color: "#5A7368" }}>Estadio con techo cerrado — el clima no afecta el juego.</p>
        )}

        <div className="grid grid-cols-2 gap-3 mt-3 pt-3" style={{ borderTop: "1px dashed #2A4D3B" }}>
          <SegmentedControl label="Día / Noche" value={daynight} onChange={setDaynight} options={[["dia", "Día"], ["noche", "Noche"]]} />
          <div>
            <div className="text-[10px] tracking-widest uppercase mb-1.5" style={{ color: "#8FA599" }}>Día de la semana</div>
            <select value={weekday} onChange={(e) => setWeekday(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border text-xs outline-none" style={{ background: "#0F251C", borderColor: "#1F3D30", color: "#EDEAE1" }}>
              {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d) => (
                <option key={d} value={d} style={{ background: "#0F251C" }}>{d}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[10px] mt-2.5 leading-relaxed" style={{ color: "#5A7368" }}>
          Día/noche y día de la semana se muestran como contexto, pero no ajustan la probabilidad: la evidencia
          estadística de su efecto real en el resultado es demasiado débil para incluirla con honestidad.
        </p>
      </div>

      <div className="space-y-4">
        <ProbabilityRow code={home} rec={recHome} prob={homeProb} isFavored={homeProb >= awayProb} tag="Local" />
        <ProbabilityRow code={away} rec={recAway} prob={awayProb} isFavored={awayProb > homeProb} tag="Visitante" />
      </div>

      <div className="mt-5 flex items-center justify-between text-[11px]" style={{ color: "#8FA599" }}>
        <span>Entorno ofensivo efectivo hoy: {effectiveRunFactor.toFixed(2)} ({effectiveRunFactor >= 1 ? "favorece bateo" : "favorece pitcheo"})</span>
      </div>

      <div className="mt-6 pt-5 flex items-start gap-3" style={{ borderTop: "1px dashed #2A4D3B" }}>
        <Activity className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#8FA599" }} />
        <p className="text-xs leading-relaxed" style={{ color: "#8FA599" }}>
          Esta probabilidad es calibrada, no una certeza. El abridor mostrado es el as/referencia actual de la
          rotación de cada equipo — el modelo aún no sabe si es el que realmente lanza hoy; eso requeriría
          conectar el calendario probable día a día, el siguiente salto lógico de precisión.
        </p>
      </div>
    </div>
  );
}

function PitcherCard({ team, pitcher, tag }) {
  const qualityColor = !pitcher.eraConfirmed ? "#8FA599" : pitcher.era < 3.2 ? "#FFB627" : pitcher.era > 4.2 ? "#C8393E" : "#C9D6CD";
  return (
    <div className="p-2.5 rounded-lg border" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] tracking-widest uppercase" style={{ color: "#8FA599" }}>{team} · {tag}</div>
        {pitcher.isRealToday && (
          <div className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#1A362A", color: "#3FC97A" }}>
            REAL HOY
          </div>
        )}
      </div>
      <div className="text-sm font-semibold mb-0.5" style={{ color: "#EDEAE1" }}>{pitcher.name}</div>
      <div className="text-xs tabular-nums" style={{ color: qualityColor, fontFamily: "ui-monospace, monospace" }}>
        {pitcher.hand === "L" ? "Zurdo" : pitcher.hand === "R" ? "Derecho" : "Mano no confirmada"} · {pitcher.eraConfirmed ? `${pitcher.era.toFixed(2)} ERA` : "ERA no confirmado"}
      </div>
    </div>
  );
}

function SegmentedControl({ label, value, onChange, options }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest uppercase mb-1.5" style={{ color: "#8FA599" }}>{label}</div>
      <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "#1F3D30" }}>
        {options.map(([val, lbl]) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            className="flex-1 py-1.5 text-[11px] font-semibold transition-colors"
            style={{ background: value === val ? "#FFB627" : "#0F251C", color: value === val ? "#0B1F17" : "#8FA599" }}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

function TeamSelect({ label, value, onChange, teamCodes }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest uppercase mb-1.5" style={{ color: "#8FA599" }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
        style={{ background: "#12281E", borderColor: "#1F3D30", color: "#EDEAE1" }}
      >
        {[...teamCodes].sort((a, b) => TEAM_RECORDS[a].name.localeCompare(TEAM_RECORDS[b].name)).map((c) => (
          <option key={c} value={c} style={{ background: "#12281E" }}>{TEAM_RECORDS[c].name}</option>
        ))}
      </select>
    </div>
  );
}

function ProbabilityRow({ code, rec, prob, isFavored, tag }) {
  const pct = (prob * 100).toFixed(1);
  return (
    <div className="p-3.5 rounded-lg border" style={{ background: isFavored ? "#17332688" : "#12281E", borderColor: isFavored ? "#FFB627" : "#1F3D30" }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-semibold" style={{ color: "#EDEAE1" }}>{rec.name} <span className="text-[10px] font-normal" style={{ color: "#5A7368" }}>· {tag}</span></div>
          <div className="text-[11px]" style={{ color: "#8FA599" }}>{rec.w}-{rec.l} · {rec.wpct.toFixed(3)} PCT</div>
        </div>
        <div className="text-2xl font-black tabular-nums" style={{ color: isFavored ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>
          {pct}%
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full" style={{ background: "#1A362A" }}>
        <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: isFavored ? "#FFB627" : "#5A7368" }} />
      </div>
    </div>
  );
}

function DailyPicks() {
  // Top 3 bateadores por probabilidad real de hit EN EL JUEGO (temporada
  // completa, sin rival específico — para eso está el selector "Rival de
  // hoy" en la pestaña Jugadores).
  const topHitters = [...PLAYERS]
    .map((p) => ({ player: p, prob: toGameProbability(hitProbabilities(p).hit, p.ab / p.g) }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 3);

  // Top 3 equipos por probabilidad de ganar, usando Log5 contra un rival
  // promedio de liga (.500) — es decir, su nivel general de temporada, NO
  // el rival específico de hoy (no tenemos el calendario completo de los
  // 30 equipos para hoy, solo confirmamos HOU @ SF como partido real).
  const topTeams = Object.keys(TEAM_RECORDS)
    .map((code) => ({ code, rec: TEAM_RECORDS[code], prob: log5(TEAM_RECORDS[code].wpct, 0.5) }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
        <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>
          Picks del día · bateadores
        </div>
        <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
          Mayor probabilidad de hit hoy
        </h2>
        <div className="space-y-3">
          {topHitters.map(({ player, prob }, i) => (
            <div key={player.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: i === 0 ? "#FFB627" : "#1F3D30" }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0" style={{ background: "#1A362A", color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold" style={{ color: "#EDEAE1" }}>{player.name}</div>
                <div className="text-[11px]" style={{ color: "#8FA599" }}>{player.team} · {player.pos} · {player.avg.toFixed(3)} AVG</div>
              </div>
              <div className="text-xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                {prob.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] mt-3 leading-relaxed" style={{ color: "#5A7368" }}>
          Probabilidad de conseguir al menos un hit en el juego, calculada con sus turnos al bate promedio reales de la temporada — no ajustada por el pitcher rival de hoy.
        </p>
      </div>

      <div className="rounded-xl border p-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
        <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>
          Picks del día · equipos
        </div>
        <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
          Mayor probabilidad de ganar hoy
        </h2>
        <div className="space-y-3">
          {topTeams.map(({ code, rec, prob }, i) => (
            <div key={code} className="flex items-center gap-3 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: i === 0 ? "#FFB627" : "#1F3D30" }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0" style={{ background: "#1A362A", color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold" style={{ color: "#EDEAE1" }}>{rec.name}</div>
                <div className="text-[11px]" style={{ color: "#8FA599" }}>{rec.w}-{rec.l} · {rec.wpct.toFixed(3)} PCT</div>
              </div>
              <div className="text-xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                {(prob * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] mt-3 leading-relaxed" style={{ color: "#5A7368" }}>
          Probabilidad Log5 contra un rival promedio de liga (.500) — refleja su nivel general de temporada, no un cruce específico de hoy. Para el único partido real confirmado hoy (Houston @ San Francisco), usa la pestaña Predictor.
        </p>
      </div>
    </div>
  );
}

export default function DiamondStats() {
  const [view, setView] = useState("jugadores");
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("Todos");
  const [selectedId, setSelectedId] = useState(PLAYERS[0].id);
  const [oppTeam, setOppTeam] = useState(null);
  const [liveStatus, setLiveStatus] = useState("cargando"); // "cargando" | "en-vivo" | "respaldo"
  const [liveHitters, setLiveHitters] = useState({}); // { [teamCode]: player[] } — roster en vivo por equipo
  const [hittersStatus, setHittersStatus] = useState("idle"); // "idle" | "cargando" | "listo" | "error"
  const [probablesStatus, setProbablesStatus] = useState("cargando"); // "cargando" | "en-vivo" | "sin-partidos" | "error"

  // Cuando el usuario filtra por un equipo específico (no "Todos"), traemos
  // su roster completo de bateadores en vivo del backend — así se ve el
  // equipo real de hoy, no solo el jugador curado a mano que ya teníamos.
  useEffect(() => {
    if (team === "Todos" || liveHitters[team]) return;
    let cancelled = false;
    setHittersStatus("cargando");
    fetch(`${BACKEND_URL}/api/team/${team}/hitters`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.hitters) return;
        const mapped = data.hitters
          .filter((h) => h.ab > 0 && h.g > 0)
          .map((h, i) => ({
            id: `live-${team}-${i}`,
            name: h.name, team, pos: h.pos, type: "bateador",
            bats: h.bats === "L" || h.bats === "R" ? h.bats : null, // "S" (switch) se trata como desconocido por ahora — el modelo de platoon no distingue switch-hitters todavía
            avg: h.avg, hr: h.hr, rbi: h.rbi, obp: h.obp, slg: h.slg, ops: h.ops,
            k_pct: null, trend: "flat",
            ab: h.ab, h: h.h, doubles: h.doubles, triples: h.triples, g: h.g,
          }));
        setLiveHitters((prev) => ({ ...prev, [team]: mapped }));
        setHittersStatus("listo");
      })
      .catch(() => { if (!cancelled) setHittersStatus("error"); });
    return () => { cancelled = true; };
  }, [team]);

  // Al abrir la app, intenta traer récords reales y actualizados del backend.
  // Si funciona, actualiza TEAM_RECORDS en el momento; si falla o tarda
  // demasiado (backend "dormido" en el plan gratuito), se queda con el
  // snapshot fijo de respaldo sin romper nada.
  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/standings`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.teams) return;
        for (const t of data.teams) {
          const code = TEAM_ID_TO_CODE[t.teamId];
          if (code && TEAM_RECORDS[code]) {
            TEAM_RECORDS[code] = { name: t.name, w: t.w, l: t.l, wpct: t.wpct };
          }
        }
        setLiveStatus("en-vivo");
      })
      .catch(() => {
        if (!cancelled) setLiveStatus("respaldo");
      });
    return () => { cancelled = true; };
  }, []);

  // Trae los abridores probables REALES de hoy (no el as de referencia) y
  // actualiza PITCHERS solo para los equipos que sí tienen partido hoy.
  // El endpoint actual no da mano ni ERA de estos abridores específicos —
  // se marca con eraConfirmed:false y hand:null, honestamente, en vez de
  // inventar esos datos.
  useEffect(() => {
    let cancelled = false;
    const nameToCode = Object.fromEntries(Object.keys(TEAM_RECORDS).map((c) => [TEAM_RECORDS[c].name, c]));
    fetch(`${BACKEND_URL}/api/probable-pitchers`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.games) return;
        let updated = 0;
        for (const g of data.games) {
          const homeCode = nameToCode[g.home];
          const awayCode = nameToCode[g.away];
          if (homeCode && g.homePitcher && g.homePitcher !== "Por confirmar") {
            PITCHERS[homeCode] = {
              name: g.homePitcher,
              hand: g.homePitcherHand || null,
              era: g.homePitcherEra != null ? g.homePitcherEra : LEAGUE_AVG_ERA,
              eraConfirmed: g.homePitcherEra != null,
              isRealToday: true,
            };
            updated++;
          }
          if (awayCode && g.awayPitcher && g.awayPitcher !== "Por confirmar") {
            PITCHERS[awayCode] = {
              name: g.awayPitcher,
              hand: g.awayPitcherHand || null,
              era: g.awayPitcherEra != null ? g.awayPitcherEra : LEAGUE_AVG_ERA,
              eraConfirmed: g.awayPitcherEra != null,
              isRealToday: true,
            };
            updated++;
          }
        }
        setProbablesStatus(updated > 0 ? "en-vivo" : "sin-partidos");
      })
      .catch(() => { if (!cancelled) setProbablesStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  const combinedPlayers = useMemo(() => {
    if (team === "Todos" || !liveHitters[team]) return PLAYERS;
    const curatedNames = new Set(PLAYERS.filter((p) => p.team === team).map((p) => p.name));
    const extra = liveHitters[team].filter((p) => !curatedNames.has(p.name));
    return [...PLAYERS, ...extra];
  }, [team, liveHitters]);

  const filtered = useMemo(() => {
    return combinedPlayers.filter((p) => {
      const matchesQuery = p.name.toLowerCase().includes(query.toLowerCase());
      const matchesTeam = team === "Todos" || p.team === team;
      return matchesQuery && matchesTeam;
    });
  }, [combinedPlayers, query, team]);

  const selected = combinedPlayers.find((p) => p.id === selectedId) || filtered[0] || PLAYERS[0];

  return (
    <div className="min-h-screen w-full" style={{ background: "#0B1F17" }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header estilo scoreboard */}
        <div className="mb-8 relative">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: "#C8393E" }} />
            <span className="text-[11px] tracking-[0.25em] uppercase" style={{ color: "#8FA599", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
              MLB Player Analytics — Prototipo
            </span>
          </div>
          <h1
            className="text-4xl sm:text-5xl font-black tracking-tight"
            style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif", letterSpacing: "-0.02em" }}
          >
            DIAMOND<span style={{ color: "#FFB627" }}>STATS</span>
          </h1>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: liveStatus === "en-vivo" ? "#3FC97A" : liveStatus === "cargando" ? "#FFB627" : "#8FA599",
                animation: liveStatus === "cargando" ? "pulse 1.5s ease-in-out infinite" : "none",
              }}
            />
            <span className="text-[10px] tracking-widest uppercase" style={{ color: "#8FA599" }}>
              {liveStatus === "en-vivo" && "Récords en vivo desde el backend"}
              {liveStatus === "cargando" && "Conectando al backend en vivo…"}
              {liveStatus === "respaldo" && "Backend no disponible ahora mismo — usando snapshot de respaldo"}
            </span>
          </div>
          <div className="mt-3 h-px w-full" style={{ background: "repeating-linear-gradient(90deg, #C8393E 0 10px, transparent 10px 20px)" }} />
        </div>

        {/* Pestañas */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView("jugadores")}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: view === "jugadores" ? "#FFB627" : "#12281E",
              color: view === "jugadores" ? "#0B1F17" : "#8FA599",
              border: "1px solid " + (view === "jugadores" ? "#FFB627" : "#1F3D30"),
            }}
          >
            Jugadores
          </button>
          <button
            onClick={() => setView("predictor")}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
            style={{
              background: view === "predictor" ? "#FFB627" : "#12281E",
              color: view === "predictor" ? "#0B1F17" : "#8FA599",
              border: "1px solid " + (view === "predictor" ? "#FFB627" : "#1F3D30"),
            }}
          >
            <Activity className="w-3.5 h-3.5" /> Predictor
          </button>
          <button
            onClick={() => setView("picks")}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
            style={{
              background: view === "picks" ? "#FFB627" : "#12281E",
              color: view === "picks" ? "#0B1F17" : "#8FA599",
              border: "1px solid " + (view === "picks" ? "#FFB627" : "#1F3D30"),
            }}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Picks del día
          </button>
        </div>

        {view === "predictor" ? (
          <Predictor probablesStatus={probablesStatus} />
        ) : view === "picks" ? (
          <DailyPicks />
        ) : (
        <>
        {/* Buscador y filtro */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <Search className="w-4 h-4 shrink-0" style={{ color: "#8FA599" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar jugador..."
              className="bg-transparent outline-none text-sm w-full"
              style={{ color: "#EDEAE1" }}
            />
          </div>
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="px-3.5 py-2.5 rounded-lg border text-sm outline-none"
            style={{ background: "#12281E", borderColor: "#1F3D30", color: "#EDEAE1" }}
          >
            {TEAMS.map((t) => (
              <option key={t} value={t} style={{ background: "#12281E" }}>{t}</option>
            ))}
          </select>
        </div>

        {team !== "Todos" && (
          <div className="mb-4 -mt-2">
            {hittersStatus === "cargando" && (
              <p className="text-[11px]" style={{ color: "#8FA599" }}>Trayendo roster en vivo de {team}…</p>
            )}
            {hittersStatus === "listo" && liveHitters[team]?.length > 0 && (
              <p className="text-[11px]" style={{ color: "#3FC97A" }}>
                +{liveHitters[team].length} bateadores en vivo de {team} agregados, con mano de bateo real (los switch-hitters se tratan como sin ajuste de platoon por ahora).
              </p>
            )}
            {hittersStatus === "error" && (
              <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo traer el roster en vivo de {team} — mostrando solo los curados.</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 mb-6 px-3.5 py-2.5 rounded-lg border flex-wrap" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
          <span className="text-[11px] tracking-widest uppercase shrink-0" style={{ color: "#8FA599" }}>Rival de hoy</span>
          <select
            value={oppTeam ?? ""}
            onChange={(e) => setOppTeam(e.target.value || null)}
            className="px-2.5 py-1.5 rounded-lg border text-xs outline-none"
            style={{ background: "#0F251C", borderColor: "#1F3D30", color: "#EDEAE1" }}
          >
            <option value="" style={{ background: "#0F251C" }}>Sin definir</option>
            {Object.keys(TEAM_RECORDS).sort((a, b) => TEAM_RECORDS[a].name.localeCompare(TEAM_RECORDS[b].name)).map((t) => (
              <option key={t} value={t} style={{ background: "#0F251C" }}>{TEAM_RECORDS[t].name}</option>
            ))}
          </select>
          {oppTeam && (
            <span className="text-[11px]" style={{ color: "#8FA599" }}>
              Abridor: <b style={{ color: "#EDEAE1" }}>{PITCHERS[oppTeam].name}</b> · {PITCHERS[oppTeam].hand === "L" ? "zurdo" : "derecho"} · {PITCHERS[oppTeam].era.toFixed(2)} ERA
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Lista de jugadores */}
          <div className="lg:col-span-2 space-y-2.5">
            {filtered.length === 0 && (
              <div className="text-sm py-8 text-center" style={{ color: "#8FA599" }}>Sin resultados para "{query}"</div>
            )}
            {filtered.map((p) => (
              <PlayerCard key={p.id} player={p} active={p.id === selected.id} onClick={() => setSelectedId(p.id)} />
            ))}
          </div>

          {/* Panel de detalle */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border p-6 sticky top-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>
                    {selected.team} · {selected.pos} · {selected.type === "bateador" ? "Bateador" : "Pitcher"}
                  </div>
                  <h2 className="text-2xl font-bold" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
                    {selected.name}
                  </h2>
                </div>
                <div
                  className="px-3 py-1.5 rounded-md text-xs font-bold tabular-nums flex items-center gap-1.5"
                  style={{ background: "#1A362A", color: "#FFB627", fontFamily: "ui-monospace, monospace", border: "1px solid #2A4D3B" }}
                >
                  OPS {selected.type === "bateador" ? selected.ops.toFixed(3) : "—"}
                </div>
              </div>

              {selected.type === "bateador" ? (
                <>
                  <StatBar label="Average (AVG)" value={selected.avg.toFixed(3)} max={0.4} color="#FFB627" />
                  <StatBar label="On-Base % (OBP)" value={selected.obp.toFixed(3)} max={0.45} color="#FFB627" />
                  <StatBar label="Slugging (SLG)" value={selected.slg.toFixed(3)} max={0.65} color="#FFB627" />
                  <StatBar label="OPS" value={selected.ops.toFixed(3)} max={1.05} color="#C8393E" />
                  <div className="grid grid-cols-3 gap-3 mt-5 pt-5" style={{ borderTop: "1px solid #1F3D30" }}>
                    <MiniStat label="Home Runs" value={selected.hr} />
                    <MiniStat label="RBI" value={selected.rbi} />
                    <MiniStat label="K %" value={selected.k_pct != null ? `${selected.k_pct}%` : "—"} />
                  </div>
                  <HitProbabilities player={selected} pitcher={oppTeam ? PITCHERS[oppTeam] : null} />
                </>
              ) : (
                <>
                  <StatBar label="ERA" value={selected.era.toFixed(2)} max={5} color="#FFB627" />
                  <StatBar label="WHIP" value={selected.whip.toFixed(2)} max={1.6} color="#FFB627" />
                  <StatBar label="K/9" value={selected.k9.toFixed(1)} max={13} color="#C8393E" />
                  <div className="grid grid-cols-3 gap-3 mt-5 pt-5" style={{ borderTop: "1px solid #1F3D30" }}>
                    <MiniStat label="Ponches" value={selected.so} />
                    <MiniStat label="Récord" value={`${selected.w}-${selected.l}`} />
                    <MiniStat label="Innings" value={selected.ip} />
                  </div>
                </>
              )}

              {/* Ya implementado: cruce con rival del día (ver selector arriba de la lista) */}
              <div className="mt-6 pt-5 flex items-start gap-3" style={{ borderTop: "1px dashed #2A4D3B" }}>
                <Activity className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#8FA599" }} />
                <p className="text-xs leading-relaxed" style={{ color: "#8FA599" }}>
                  Elige el "Rival de hoy" arriba de la lista para cruzar estas estadísticas con el abridor real de ese equipo (mano + ERA actual) y ver cómo cambia su probabilidad de rendimiento.
                </p>
              </div>
            </div>
          </div>
        </div>
        </>
        )}

        <p className="text-center text-[11px] mt-8" style={{ color: "#4E6459" }}>
          Bateo: datos reales temporada 2026 (MLB.com). Predictor: récords + Log5 + localía + park factors + platoon + ERA real del abridor as de cada rotación (al 10 ago 2026).
        </p>
      </div>
    </div>
  );
}

function HitProbabilities({ player, pitcher }) {
  const [mode, setMode] = useState("game");
  const perAb = matchupAdjustedProbs(player, pitcher);
  const perGame = gameProbabilities(player, pitcher);
  const p = mode === "game" ? perGame : perAb;
  const items = [
    { label: "Hit", value: p.hit, color: "#FFB627" },
    { label: "Sencillo", value: p.single, color: "#8FA599" },
    { label: "Doble", value: p.double, color: "#5A9BC8" },
    { label: "Jonrón", value: p.hr, color: "#C8393E" },
  ];
  return (
    <div className="mt-5 pt-5" style={{ borderTop: "1px solid #1F3D30" }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[11px] tracking-widest uppercase" style={{ color: "#8FA599" }}>
          Probabilidad de embasarse
        </div>
        <div className="flex items-center gap-2">
          {pitcher && (
            <div
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: p.favorable ? "#1A362A" : "#3A1E20", color: p.favorable ? "#FFB627" : "#E38A8E" }}
            >
              vs. {pitcher.name} ({pitcher.eraConfirmed ? `${pitcher.era.toFixed(2)} ERA` : "ERA no confirmado"}) · {p.favorable ? "ventaja" : "desventaja"} de platoon
            </div>
          )}
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "#1F3D30" }}>
            {[["ab", "Por turno"], ["game", "Por juego"]].map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setMode(val)}
                className="px-2.5 py-1 text-[10px] font-semibold transition-colors"
                style={{ background: mode === val ? "#FFB627" : "#0F251C", color: mode === val ? "#0B1F17" : "#8FA599" }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {items.map((it) => (
          <div key={it.label} className="p-2.5 rounded-lg border text-center" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-lg font-black tabular-nums" style={{ color: it.color, fontFamily: "ui-monospace, monospace" }}>
              {it.value.toFixed(1)}%
            </div>
            <div className="text-[10px] tracking-wide uppercase mt-0.5" style={{ color: "#8FA599" }}>{it.label}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] mt-2.5 leading-relaxed" style={{ color: "#5A7368" }}>
        {mode === "game"
          ? `Probabilidad de que ocurra al menos una vez en el juego, combinando su tasa real por turno con su promedio real de ${perGame.abPerGame.toFixed(1)} turnos al bate por juego esta temporada (${player.ab} AB en ${player.g} juegos).`
          : "Probabilidad de un turno al bate individual, directo de sus conteos reales de la temporada."}
        {pitcher
          ? ` Cruzado con el abridor real de hoy: mano (platoon) + su ERA ${pitcher.eraConfirmed ? `actual de ${pitcher.era.toFixed(2)}` : "(sin confirmar esta sesión, se usa el promedio de liga como neutral)"} vs. el promedio de liga (~4.00) — no es su split personal contra este pitcher específico, es un ajuste de liga general.`
          : " Elige el rival de hoy arriba para cruzar estas estadísticas con su abridor real."}
      </p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest uppercase mb-0.5" style={{ color: "#8FA599" }}>{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, monospace" }}>{value}</div>
    </div>
  );
}
