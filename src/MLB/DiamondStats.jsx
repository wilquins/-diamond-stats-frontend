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
  { id: 32, name: "Mike Trout", team: "LAA", pos: "CF", type: "bateador", bats: "R", avg: .235, hr: 20, rbi: 42, obp: .384, slg: .445, ops: .829, k_pct: null, trend: "flat", ab: 362, h: 85, doubles: 16, triples: 0, g: 101 },
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
function matchupAdjustedProbs(p, pitcher, todaysDayNight) {
  const base = hitProbabilities(p);

  // Ajuste real de día/noche: compara su OPS real jugando de día (o de
  // noche) contra su OPS de toda la temporada. Usa el dato REAL del
  // partido de hoy de su equipo (si juegan hoy) — no la hora del reloj de
  // quien esté mirando la app, que no tiene nada que ver con el horario
  // real del juego.
  const dayNightSplit = todaysDayNight === "day" ? p.vsDay : todaysDayNight === "night" ? p.vsNight : null;
  const usedDayNightSplit = dayNightSplit != null && dayNightSplit.ops != null && p.ops > 0;
  const dayNightMult = usedDayNightSplit
    ? Math.min(1.3, Math.max(0.75, dayNightSplit.ops / p.ops))
    : 1;

  if (!pitcher) {
    const hit = base.hit * dayNightMult;
    const hr = base.hr * dayNightMult;
    const double = base.double * dayNightMult;
    const triple = base.triple;
    const single = Math.max(0, hit - double - triple - hr);
    return { hit, single, double, triple, hr, favorable: null, pitcher: null, usedRealSplit: false, usedDayNightSplit };
  }

  const knownHand = p.bats === "L" || p.bats === "R";
  const favorable = knownHand ? p.bats !== pitcher.hand : null;

  // Si tenemos el split REAL del jugador contra esa mano específica (con
  // muestra suficiente, ya filtrado en el backend), lo usamos en vez del
  // ajuste genérico de liga — esto es la diferencia real entre un jugador
  // como Yordan Álvarez (parejo contra ambas manos) y uno con una brecha
  // grande de verdad.
  const realSplit = pitcher.hand === "L" ? p.vsL : pitcher.hand === "R" ? p.vsR : null;
  const usedRealSplit = knownHand && realSplit != null && realSplit.ops != null && base.hit > 0;

  let platoonHitMult, platoonHrMult, platoonDoubleMult;
  if (usedRealSplit) {
    // Compara su OPS real contra esa mano vs. su OPS real de toda la
    // temporada — la proporción entre ambos es su ajuste de platoon
    // GENUINO, específico de este jugador, no un supuesto de liga.
    const ratio = p.ops > 0 ? realSplit.ops / p.ops : 1;
    const clamped = Math.min(1.4, Math.max(0.65, ratio));
    platoonHitMult = clamped;
    platoonHrMult = Math.min(1.6, Math.max(0.5, 1 + (clamped - 1) * 1.8)); // el jonrón reacciona más fuerte al platoon que el hit simple
    platoonDoubleMult = Math.min(1.5, Math.max(0.6, 1 + (clamped - 1) * 1.3));
  } else {
    platoonHitMult = favorable === null ? 1 : favorable ? 1.05 : 0.95;
    platoonHrMult = favorable === null ? 1 : favorable ? 1.15 : 0.85;
    platoonDoubleMult = favorable === null ? 1 : favorable ? 1.08 : 0.92;
  }

  const qualityMult = Math.min(1.5, Math.max(0.6, 1 - (LEAGUE_AVG_ERA - pitcher.era) * 0.03));
  const hit = base.hit * platoonHitMult * qualityMult * dayNightMult;
  const hr = base.hr * platoonHrMult * qualityMult * dayNightMult;
  const double = base.double * platoonDoubleMult * qualityMult * dayNightMult;
  const triple = base.triple; // sin evidencia suficiente de split para triples, se deja neutral
  const single = Math.max(0, hit - double - triple - hr);
  return { hit, single, double, triple, hr, favorable, pitcher, qualityMult, usedRealSplit, usedDayNightSplit };
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

function gameProbabilities(p, pitcher, todaysDayNight) {
  const perAb = matchupAdjustedProbs(p, pitcher, todaysDayNight);
  const abPerGame = p.ab / p.g;
  return {
    hit: toGameProbability(perAb.hit, abPerGame),
    single: toGameProbability(perAb.single, abPerGame),
    double: toGameProbability(perAb.double, abPerGame),
    hr: toGameProbability(perAb.hr, abPerGame),
    abPerGame,
    favorable: perAb.favorable,
    pitcher: perAb.pitcher,
    usedRealSplit: perAb.usedRealSplit,
    usedDayNightSplit: perAb.usedDayNightSplit,
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

// Orientación REAL confirmada de home plate hacia el jardín central, solo
// para los estadios donde encontramos el dato verificado (fuente: artículo
// "Facing the Sun: Understanding MLB Stadium Orientations"). Es un valor
// aproximado en grados (a partir de la dirección cardinal descrita, no un
// azimut exacto medido). Los 27 equipos restantes no tienen este dato
// confirmado — el ícono usa una orientación genérica para ellos, no lo
// inventamos.
const HOME_PLATE_ORIENTATION = {
  BOS: 135, // Fenway Park — sureste
  CHC: 270, // Wrigley Field — oeste
  NYY: 45,  // Yankee Stadium — noreste (aprox.)
};

const HOME_ADVANTAGE = 0.024; // % histórico real de ventaja de jugar de local en MLB (~54% vs 50%)

// ---- Abridores reales por equipo, temporada 2026 (fuente: MLB.com / reportes de rotación, al 10 ago 2026) ----
// Se usa el as/abridor probable más reciente de cada equipo. eraConfirmed:false
// significa que el nombre es real (confirmado como as actual del equipo) pero
// no encontramos su ERA numérico exacto de esta temporada en esta sesión —
// en ese caso el modelo usa el promedio de liga (neutral) para no inventar
// una cifra, y la interfaz lo muestra como "ERA no confirmado".
let PITCHERS = {
  BAL: { name: "Brandon Young", hand: "R", era: 3.33, eraConfirmed: true },
  BOS: { name: "Sonny Gray", hand: "R", era: 2.79, eraConfirmed: true },
  NYY: { name: "Cam Schlittler", hand: "R", era: 2.21, eraConfirmed: true },
  TB: { name: "Ian Seymour", hand: "L", era: 4.27, eraConfirmed: true },
  TOR: { name: "Dylan Cease", hand: "R", era: 2.28, eraConfirmed: true },
  CWS: { name: "Sean Burke", hand: "R", era: 3.08, eraConfirmed: true },
  CLE: { name: "Gavin Williams", hand: "R", era: 3.55, eraConfirmed: true },
  DET: { name: "Drew Anderson", hand: "R", era: 4.01, eraConfirmed: true },
  KC: { name: "Michael Wacha", hand: "R", era: 3.46, eraConfirmed: true },
  MIN: { name: "Joe Ryan", hand: "R", era: 3.65, eraConfirmed: true },
  HOU: { name: "Hunter Brown", hand: "R", era: 3.57, eraConfirmed: true },
  LAA: { name: "Reid Detmers", hand: "L", era: 4.12, eraConfirmed: true },
  ATH: { name: "J.T. Ginn", hand: "R", era: 3.41, eraConfirmed: true },
  SEA: { name: "Logan Gilbert", hand: "R", era: 3.42, eraConfirmed: true },
  TEX: { name: "Jacob deGrom", hand: "R", era: 3.87, eraConfirmed: true },
  ATL: { name: "Chris Sale", hand: "L", era: 2.20, eraConfirmed: true },
  MIA: { name: "Eury Pérez", hand: "R", era: 3.39, eraConfirmed: true },
  NYM: { name: "Nolan McLean", hand: "R", era: 3.51, eraConfirmed: true },
  PHI: { name: "Cristopher Sánchez", hand: "L", era: 2.65, eraConfirmed: true },
  WSH: { name: "Cade Cavalli", hand: "R", era: 3.57, eraConfirmed: true },
  CHC: { name: "Kevin Gausman", hand: "R", era: 4.29, eraConfirmed: true },
  CIN: { name: "Chase Burns", hand: "R", era: 2.61, eraConfirmed: true },
  MIL: { name: "Jacob Misiorowski", hand: "R", era: 1.76, eraConfirmed: true },
  PIT: { name: "Paul Skenes", hand: "R", era: 3.96, eraConfirmed: true },
  STL: { name: "Kyle Leahy", hand: "R", era: 3.38, eraConfirmed: true },
  ARI: { name: "Eduardo Rodríguez", hand: "L", era: 2.70, eraConfirmed: true },
  COL: { name: "Por confirmar", hand: "R", era: 4.00, eraConfirmed: false },
  LAD: { name: "Justin Wrobleski", hand: "L", era: 3.31, eraConfirmed: true },
  SD: { name: "Michael King", hand: "R", era: 2.76, eraConfirmed: true },
  SF: { name: "Logan Webb", hand: "R", era: 3.74, eraConfirmed: true },
};

const LEAGUE_AVG_ERA = 4.00; // promedio histórico aproximado de MLB, usado como línea base

// Promedio REAL de carreras combinadas por juego en MLB temporada 2026,
// calculado a partir de las carreras anotadas y juegos jugados de los 30
// equipos (fuente: MLB.com Team Hitting Stats, al 11 ago 2026) — no es una
// aproximación histórica, es el dato real de esta temporada específica.
const BASELINE_TOTAL_RUNS = 8.94;

// Distribución de Poisson — el modelo estadístico estándar para datos de
// "conteo" como carreras anotadas en un juego. factorial() y poissonCDF()
// nos dejan calcular P(carreras totales <= k) dado un promedio esperado.
function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
function poissonCDF(k, lambda) {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += (Math.exp(-lambda) * Math.pow(lambda, i)) / factorial(i);
  }
  return sum;
}

// Estima una línea de Over/Under (siempre terminada en .5, como en la vida
// real) y su probabilidad, a partir del total de carreras esperado.
function estimateOverUnder(expectedRuns) {
  const line = Math.round(expectedRuns - 0.5) + 0.5;
  const under = poissonCDF(Math.floor(line), expectedRuns);
  const over = 1 - under;
  return { line, overProb: over, underProb: under };
}

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


function WindFieldIcon({ deg, mph, orientationDeg }) {
  const towardDeg = (deg + 180) % 360;
  const hasRealOrientation = orientationDeg != null;
  // Si tenemos la orientación real, rotamos el campo entero para que su
  // "home plate" apunte hacia donde realmente apunta en ese estadio —
  // así la flecha del viento se puede leer en relación al jardín central
  // de verdad, no a una orientación genérica inventada.
  const fieldRotation = hasRealOrientation ? orientationDeg : 0;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 140" width="100" height="100">
        {/* Letras de puntos cardinales alrededor, para ubicar la flecha sin ambigüedad */}
        <text x="70" y="14" textAnchor="middle" fontSize="13" fontWeight="700" fill="#8FA599">N</text>
        <text x="70" y="134" textAnchor="middle" fontSize="13" fontWeight="700" fill="#8FA599">S</text>
        <text x="10" y="74" textAnchor="middle" fontSize="13" fontWeight="700" fill="#8FA599">O</text>
        <text x="130" y="74" textAnchor="middle" fontSize="13" fontWeight="700" fill="#8FA599">E</text>

        {/* Campo de béisbol — rotado a la orientación real si la tenemos.
            Home plate queda abajo (perspectiva de estar detrás del plato). */}
        <g transform={`rotate(${fieldRotation}, 70, 70)`}>
          <path
            d="M70 118 L112 82 L98 22 L42 22 L28 82 Z"
            fill="#0B3D33"
            stroke={hasRealOrientation ? "#3FC97A" : "#D97B3F"}
            strokeWidth="3.5"
          />
          <path
            d="M70 92 L48 70 L70 48 L92 70 Z"
            fill="none"
            stroke="#EDEAE1"
            strokeWidth="1.5"
            opacity="0.5"
          />
          {/* Etiquetas de home plate y las bases, para que no haya duda de cuál es cuál */}
          <text x="70" y="101" textAnchor="middle" fontSize="8" fontWeight="700" fill="#FFB627">P</text>
          <text x="98" y="73" textAnchor="start" fontSize="8" fontWeight="700" fill="#FFB627">1</text>
          <text x="70" y="41" textAnchor="middle" fontSize="8" fontWeight="700" fill="#FFB627">2</text>
          <text x="42" y="73" textAnchor="end" fontSize="8" fontWeight="700" fill="#FFB627">3</text>
        </g>

        {/* Flecha del viento — apunta hacia donde SOPLA (no de dónde viene) */}
        <g transform={`translate(70,70) rotate(${towardDeg})`}>
          <line x1="0" y1="22" x2="0" y2="-24" stroke="#FFB627" strokeWidth="5" strokeLinecap="round" />
          <path d="M-10,-14 L0,-28 L10,-14 Z" fill="#FFB627" stroke="#0B3D33" strokeWidth="1" />
        </g>
      </svg>
      <div className="text-[9px] font-semibold mt-0.5" style={{ color: hasRealOrientation ? "#3FC97A" : "#8FA599" }}>
        {hasRealOrientation ? "Orientación real del estadio" : "Orientación genérica"}
      </div>
    </div>
  );
}

function TodayGamesHeader() {
  const [games, setGames] = useState([]);
  const [status, setStatus] = useState("cargando"); // "cargando" | "listo" | "error"
  const [selectedGamePk, setSelectedGamePk] = useState(null);
  const [gameHitters, setGameHitters] = useState([]);
  const [hittersLoadStatus, setHittersLoadStatus] = useState("idle"); // "idle" | "cargando" | "listo" | "error"
  const [gameWeather, setGameWeather] = useState(null);
  const [weatherStatus, setWeatherStatus] = useState("idle");
  const [gameBullpen, setGameBullpen] = useState({}); // { [code]: {...} }
  const [bullpenStatus, setBullpenStatus] = useState("idle");
  const [gameSituational, setGameSituational] = useState({}); // { [code]: {...} }
  const [situationalStatus, setSituationalStatus] = useState("idle");
  const [headToHead, setHeadToHead] = useState(null); // { gamesPlayed, homeTeamWins, awayTeamWins }
  const [headToHeadStatus, setHeadToHeadStatus] = useState("idle");
  const [gameRest, setGameRest] = useState({}); // { [code]: { daysRested, lastGameDayNight, ... } }
  const [restStatus, setRestStatus] = useState("idle");
  const [hitStreaks, setHitStreaks] = useState({}); // { [playerId]: number de juegos consecutivos con hit }
  const [lineupAvailable, setLineupAvailable] = useState(false); // ¿ya se publicó la alineación real de hoy?
  const [lineupData, setLineupDataState] = useState(null); // { home: [...], away: [...] } — la alineación real completa
  const [showLineup, setShowLineup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/games/today`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setGames(data.games || []);
        setStatus("listo");

        // Guarda automáticamente la predicción de TODOS los partidos
        // reales de hoy, sin que el usuario tenga que entrar a cada uno.
        // Usa el modelo base real (Log5 + localía + parque + ERA del
        // abridor, cuando está confirmado) — no incluye bullpen ni forma
        // reciente aquí, para no multiplicar decenas de llamadas extra
        // solo por abrir la pestaña. Si luego entras al detalle de un
        // partido específico, ese cálculo completo no sobreescribe esta
        // predicción ya guardada (el backend evita duplicados por diseño).
        const gameDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        for (const g of data.games || []) {
          const recHome = TEAM_RECORDS[g.homeCode];
          const recAway = TEAM_RECORDS[g.awayCode];
          const stadium = STADIUMS[g.homeCode];
          if (!recHome || !recAway || !stadium) continue;
          const baseProb = log5(recHome.wpct, recAway.wpct);
          const { prob: homeWinProb } = adjustedHomeProb({
            baseProb, stadium, wind: "neutro", temp: "templado",
            home: g.homeCode, away: g.awayCode,
          });
          fetch(`${BACKEND_URL}/api/predictions/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ game_date: gameDate, home_code: g.homeCode, away_code: g.awayCode, home_win_prob: homeWinProb }),
          }).catch(() => {});
        }
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  const selectGame = (game) => {
    if (selectedGamePk === game.gamePk) {
      setSelectedGamePk(null);
      setGameHitters([]);
      return;
    }
    setSelectedGamePk(game.gamePk);
    setGameHitters([]);
    setHittersLoadStatus("cargando");

    const pitcherFor = (p) => (p && p.name !== "Por confirmar" ? { hand: p.hand, era: p.era != null ? p.era : LEAGUE_AVG_ERA } : null);

    Promise.all([
      fetch(`${BACKEND_URL}/api/team/${game.homeCode}/hitters`).then((r) => r.json()),
      fetch(`${BACKEND_URL}/api/team/${game.awayCode}/hitters`).then((r) => r.json()),
      fetch(`${BACKEND_URL}/api/game/${game.gamePk}/lineup`).then((r) => r.json()).catch(() => ({ available: false })),
    ])
      .then(([homeData, awayData, lineupData]) => {
        let homeBatters = (homeData.hitters || [])
          .filter((h) => h.ab > 0 && h.g > 0)
          .map((h) => ({ ...h, team: game.homeCode, pitcher: pitcherFor(game.awayPitcher) }));
        let awayBatters = (awayData.hitters || [])
          .filter((h) => h.ab > 0 && h.g > 0)
          .map((h) => ({ ...h, team: game.awayCode, pitcher: pitcherFor(game.homePitcher) }));

        // Si la alineación real de hoy ya está publicada, filtramos a SOLO
        // los jugadores confirmados en ella — mucho más preciso que usar
        // todo el roster activo (que incluye a quien esté descansando).
        if (lineupData.available) {
          const homeNames = new Set((lineupData.home || []).map((p) => p.name));
          const awayNames = new Set((lineupData.away || []).map((p) => p.name));
          homeBatters = homeBatters.filter((p) => homeNames.has(p.name));
          awayBatters = awayBatters.filter((p) => awayNames.has(p.name));
        }
        setLineupAvailable(lineupData.available === true);
        setLineupDataState(lineupData.available ? lineupData : null);

        const combined = [...homeBatters, ...awayBatters].map((p) => {
          const gp = gameProbabilities(p, p.pitcher, game.dayNight);
          return { id: p.id, name: p.name, team: p.team, pos: p.pos, hit: gp.hit, single: gp.single, double: gp.double, hr: gp.hr };
        });
        setGameHitters(combined);
        setHittersLoadStatus("listo");
      })
      .catch(() => setHittersLoadStatus("error"));

    // Clima real del estadio local (solo si no tiene techo cerrado).
    const stadium = STADIUMS[game.homeCode];
    if (stadium && !stadium.roofed) {
      setWeatherStatus("cargando");
      fetch(`${BACKEND_URL}/api/weather/${game.homeCode}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { setWeatherStatus("error"); return; }
          setGameWeather(data);
          setWeatherStatus("listo");
        })
        .catch(() => setWeatherStatus("error"));
    } else {
      setGameWeather(null);
      setWeatherStatus("idle");
    }

    // Calidad real de bullpen de ambos equipos.
    setBullpenStatus("cargando");
    Promise.all(
      [game.homeCode, game.awayCode].map((code) =>
        fetch(`${BACKEND_URL}/api/team/${code}/bullpen`).then((r) => r.json()).then((data) => ({ code, data })).catch(() => ({ code, data: null }))
      )
    ).then((results) => {
      const next = {};
      for (const { code, data } of results) if (data && !data.error) next[code] = data;
      setGameBullpen(next);
      setBullpenStatus("listo");
    });

    // Récord real situacional (día/noche + día de la semana) de ambos equipos.
    setSituationalStatus("cargando");
    Promise.all(
      [game.homeCode, game.awayCode].map((code) =>
        fetch(`${BACKEND_URL}/api/team/${code}/situational`).then((r) => r.json()).then((data) => ({ code, data })).catch(() => ({ code, data: null }))
      )
    ).then((results) => {
      const next = {};
      for (const { code, data } of results) if (data && !data.error) next[code] = data;
      setGameSituational(next);
      setSituationalStatus("listo");
    });

    // Historial real cara a cara entre estos dos equipos específicos, esta
    // temporada — no es un promedio genérico, es su enfrentamiento real.
    setHeadToHeadStatus("cargando");
    fetch(`${BACKEND_URL}/api/matchup/${game.homeCode}/${game.awayCode}/headtohead`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setHeadToHeadStatus("error"); return; }
        setHeadToHead(data);
        setHeadToHeadStatus("listo");
      })
      .catch(() => setHeadToHeadStatus("error"));

    // Descanso real de ambos equipos — cuántos días libres tuvieron antes
    // de este partido, y si vienen de un "getaway day" (jugar de noche y
    // al día siguiente de día, con poco descanso real).
    const gameDateForRest = new Date(game.time).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    setRestStatus("cargando");
    Promise.all(
      [game.homeCode, game.awayCode].map((code) =>
        fetch(`${BACKEND_URL}/api/team/${code}/rest?date=${gameDateForRest}`).then((r) => r.json()).then((data) => ({ code, data })).catch(() => ({ code, data: null }))
      )
    ).then((results) => {
      const next = {};
      for (const { code, data } of results) if (data && !data.error) next[code] = data;
      setGameRest(next);
      setRestStatus("listo");
    });
  };

  const selectedGame = games.find((g) => g.gamePk === selectedGamePk);
  const topBy = (key, n = 3) => [...gameHitters].sort((a, b) => b[key] - a[key]).slice(0, n);

  // Trae la racha real de hit SOLO para el top 3 de la categoría "Hit" —
  // no para los otros 9 jugadores que aparecen en el resto de columnas,
  // para no multiplicar llamadas de más.
  useEffect(() => {
    if (gameHitters.length === 0) return;
    const top3Hit = topBy("hit");
    top3Hit.forEach((p) => {
      if (!p.id || hitStreaks[p.id] !== undefined) return; // ya la tenemos, o no hay id
      fetch(`${BACKEND_URL}/api/player/${p.id}/streak`)
        .then((r) => r.json())
        .then((data) => {
          if (data.streak != null) setHitStreaks((prev) => ({ ...prev, [p.id]: data.streak }));
        })
        .catch(() => {});
    });
  }, [gameHitters]);

  // Guarda automáticamente la predicción del partido que el usuario está
  // viendo en Juegos de hoy — a diferencia del Predictor (que tenía fijo
  // un solo partido de referencia), esto funciona para CUALQUIER partido
  // real de hoy que se abra, cambiando día a día de verdad.
  useEffect(() => {
    if (!selectedGame) return;
    const recHome = TEAM_RECORDS[selectedGame.homeCode];
    const recAway = TEAM_RECORDS[selectedGame.awayCode];
    const stadium = STADIUMS[selectedGame.homeCode];
    if (!recHome || !recAway || !stadium) return;
    const baseProb = log5(recHome.wpct, recAway.wpct);
    const { prob: homeWinProb } = adjustedHomeProb({
      baseProb, stadium, wind: "neutro", temp: "templado",
      home: selectedGame.homeCode, away: selectedGame.awayCode,
    });
    const gameDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    fetch(`${BACKEND_URL}/api/predictions/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_date: gameDate, home_code: selectedGame.homeCode, away_code: selectedGame.awayCode, home_win_prob: homeWinProb }),
    }).catch(() => {});
  }, [selectedGame]);

  if (status === "cargando") {
    return <div className="mb-6 text-[11px]" style={{ color: "#8FA599" }}>Buscando juegos de hoy…</div>;
  }
  if (status === "error" || games.length === 0) return null; // no rompe la app si no hay juegos o falla

  // Si hay un juego seleccionado, mostramos SOLO su detalle (con botón para
  // volver), en vez de agregarlo al final de la lista de juegos.
  if (selectedGame) {
    return (
      <div className="mb-6">
        <button
          onClick={() => { setSelectedGamePk(null); setGameHitters([]); }}
          className="text-[11px] font-semibold mb-3 flex items-center gap-1"
          style={{ color: "#FFB627" }}
        >
          ← Volver a juegos de hoy
        </button>

        <div className="p-4 rounded-xl border" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
          <div className="text-sm font-bold mb-1" style={{ color: "#EDEAE1" }}>{selectedGame.away} @ {selectedGame.home}</div>
          <div className="text-[11px] mb-4" style={{ color: "#8FA599" }}>
            {selectedGame.venue} · Abridores: {selectedGame.awayPitcher.name} vs. {selectedGame.homePitcher.name}
          </div>

          {(() => {
            const recHome = TEAM_RECORDS[selectedGame.homeCode];
            const recAway = TEAM_RECORDS[selectedGame.awayCode];
            const stadium = STADIUMS[selectedGame.homeCode];
            if (!recHome || !recAway || !stadium) return null;
            const baseProb = log5(recHome.wpct, recAway.wpct);
            const { prob: baseHomeWinProb, effectiveRunFactor } = adjustedHomeProb({
              baseProb, stadium, wind: "neutro", temp: "templado",
              home: selectedGame.homeCode, away: selectedGame.awayCode,
            });

            // Mismo ajuste situacional real que usa el Predictor: forma
            // reciente (últimos 10, el de más peso), día/noche real de
            // hoy, y día de la semana — todos comparados contra su % de
            // victorias general de temporada.
            const winPct = (record) => {
              if (!record) return null;
              const total = record.w + record.l;
              return total >= 5 ? record.w / total : null;
            };
            const todayWd = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][new Date().getDay()];
            const situationalDeltaFor = (code, dayNight) => {
              const s = gameSituational[code];
              if (!s) return 0;
              const overall = TEAM_RECORDS[code].wpct;
              const dnPct = dayNight === "day" ? winPct(s.dayRecord) : dayNight === "night" ? winPct(s.nightRecord) : null;
              const wdPct = winPct(s.byWeekday?.[todayWd]);
              const l10Pct = winPct(s.last10Record);
              let delta = 0;
              if (dnPct != null) delta += (dnPct - overall) * 0.3;
              if (wdPct != null) delta += (wdPct - overall) * 0.3;
              if (l10Pct != null) delta += (l10Pct - overall) * 0.5;
              return delta;
            };
            const situationalAdj =
              situationalDeltaFor(selectedGame.homeCode, selectedGame.dayNight) -
              situationalDeltaFor(selectedGame.awayCode, selectedGame.dayNight);

            // Mismo ajuste real de bullpen que usa el Predictor.
            const homeBpEra = gameBullpen[selectedGame.homeCode]?.bullpenERA;
            const awayBpEra = gameBullpen[selectedGame.awayCode]?.bullpenERA;
            const bullpenAdj =
              homeBpEra != null && awayBpEra != null
                ? (LEAGUE_AVG_ERA - homeBpEra) * 0.025 - (LEAGUE_AVG_ERA - awayBpEra) * 0.025
                : 0;

            // Ajuste real de historial cara a cara — solo si hay al menos
            // 3 juegos de muestra esta temporada entre estos dos equipos
            // específicos, para no reaccionar a un solo juego suelto.
            let h2hAdj = 0;
            if (headToHead && headToHead.gamesPlayed >= 3) {
              const h2hHomePct = headToHead.homeTeamWins / headToHead.gamesPlayed;
              h2hAdj = (h2hHomePct - 0.5) * 0.4;
            }

            // Ajuste real de descanso/fatiga: penaliza levemente a un
            // equipo que jugó ayer sin descanso (back-to-back), y un poco
            // más si además fue un "getaway day" real (jugaron de noche
            // ayer y hoy les toca de día, con poco descanso de verdad).
            const fatiguePenalty = (rest) => {
              if (!rest || rest.daysRested == null) return 0;
              let penalty = 0;
              if (rest.daysRested === 0) penalty -= 0.015;
              if (rest.daysRested === 0 && rest.lastGameDayNight === "night" && selectedGame.dayNight === "day") penalty -= 0.015;
              return penalty;
            };
            const homeFatigue = fatiguePenalty(gameRest[selectedGame.homeCode]);
            const awayFatigue = fatiguePenalty(gameRest[selectedGame.awayCode]);
            const fatigueAdj = homeFatigue - awayFatigue; // si el visitante está más cansado, esto suma a favor del local

            const homeWinProb = Math.min(0.92, Math.max(0.08, baseHomeWinProb + situationalAdj + bullpenAdj + h2hAdj + fatigueAdj));
            const awayWinProb = 1 - homeWinProb;

            // Over/Under real: combina el park factor (+ clima, ya incluido
            // en effectiveRunFactor) con el ERA de AMBOS abridores de este
            // juego específico, y lo pasa por una distribución de Poisson
            // para sacar una probabilidad genuina, no solo una etiqueta.
            const homeEra = selectedGame.homePitcher.era != null ? selectedGame.homePitcher.era : LEAGUE_AVG_ERA;
            const awayEra = selectedGame.awayPitcher.era != null ? selectedGame.awayPitcher.era : LEAGUE_AVG_ERA;
            const pitcherFactor = ((homeEra + awayEra) / 2) / LEAGUE_AVG_ERA;

            // Ajuste real: si estos dos equipos específicos han anotado
            // más (o menos) carreras entre ellos de lo normal esta
            // temporada, eso empuja el número — con peso moderado (30%)
            // para no sobre-reaccionar, y solo con 3+ juegos de muestra.
            let h2hRunsFactor = 1;
            if (headToHead && headToHead.gamesPlayed >= 3 && headToHead.overUnder?.avgTotalRuns != null) {
              const ratio = headToHead.overUnder.avgTotalRuns / BASELINE_TOTAL_RUNS;
              h2hRunsFactor = 1 + (ratio - 1) * 0.3;
            }

            const expectedRuns = BASELINE_TOTAL_RUNS * effectiveRunFactor * pitcherFactor * h2hRunsFactor;
            const { line, overProb, underProb } = estimateOverUnder(expectedRuns);
            const bothErasConfirmed = selectedGame.homePitcher.era != null && selectedGame.awayPitcher.era != null;

            return (
              <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
                <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Probabilidad de ganar (Log5 + localía + parque + platoon + ERA + bullpen + forma reciente + cara a cara + descanso)</div>
                <div className="space-y-2.5 mb-3">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span style={{ color: awayWinProb >= homeWinProb ? "#FFB627" : "#C9D6CD" }}>{selectedGame.away}</span>
                      <span className="font-bold tabular-nums" style={{ color: awayWinProb >= homeWinProb ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{(awayWinProb * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full" style={{ background: "#1A362A" }}>
                      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${(awayWinProb * 100).toFixed(1)}%`, background: awayWinProb >= homeWinProb ? "#FFB627" : "#5A7368" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span style={{ color: homeWinProb > awayWinProb ? "#FFB627" : "#C9D6CD" }}>{selectedGame.home}</span>
                      <span className="font-bold tabular-nums" style={{ color: homeWinProb > awayWinProb ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{(homeWinProb * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full" style={{ background: "#1A362A" }}>
                      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${(homeWinProb * 100).toFixed(1)}%`, background: homeWinProb > awayWinProb ? "#FFB627" : "#5A7368" }} />
                    </div>
                  </div>
                </div>

                <div className="pt-3" style={{ borderTop: "1px dashed #2A4D3B" }}>
                  <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
                    Over/Under estimado · línea {line.toFixed(1)} carreras
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between text-xs p-2 rounded-md" style={{ background: overProb >= underProb ? "#1A362A" : "#0F251C" }}>
                      <span style={{ color: overProb >= underProb ? "#FFB627" : "#C9D6CD" }}>Over {line.toFixed(1)}</span>
                      <span className="font-bold tabular-nums" style={{ color: overProb >= underProb ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{(overProb * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs p-2 rounded-md" style={{ background: underProb > overProb ? "#1A362A" : "#0F251C" }}>
                      <span style={{ color: underProb > overProb ? "#FFB627" : "#C9D6CD" }}>Under {line.toFixed(1)}</span>
                      <span className="font-bold tabular-nums" style={{ color: underProb > overProb ? "#FFB627" : "#C9D6CD", fontFamily: "ui-monospace, monospace" }}>{(underProb * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                  <p className="text-[10px] mt-2.5 leading-relaxed" style={{ color: "#5A7368" }}>
                    Carreras totales esperadas: {expectedRuns.toFixed(1)} — combina el promedio real de MLB esta temporada ({BASELINE_TOTAL_RUNS}, calculado de los 30 equipos), el park factor de {stadium.park}, el ERA de ambos abridores{bothErasConfirmed ? "" : " (uno o ambos sin ERA confirmado hoy, se usó el promedio de liga como neutral)"}{h2hRunsFactor !== 1 ? ", y su historial real de carreras entre ellos esta temporada" : ""}, pasado por una distribución de Poisson. Es un modelo estadístico real, no una garantía — no incluye lineup del día ni clima minuto a minuto.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Clima real del estadio */}
          {weatherStatus !== "idle" && (
            <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Clima real del estadio</div>
              {weatherStatus === "cargando" && <p className="text-[11px]" style={{ color: "#8FA599" }}>Consultando clima real…</p>}
              {weatherStatus === "error" && <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo traer el clima real ahora mismo.</p>}
              {weatherStatus === "listo" && gameWeather && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span style={{ fontSize: "24px" }}>{gameWeather.icon}</span>
                  <div>
                    <div className="text-base font-bold tabular-nums" style={{ color: "#EDEAE1", fontFamily: "ui-monospace, monospace" }}>{gameWeather.tempF.toFixed(1)}°F</div>
                    <div className="text-[10px]" style={{ color: "#8FA599" }}>{gameWeather.description}</div>
                  </div>
                  <div className="text-[11px]" style={{ color: "#8FA599" }}>
                    Humedad: <b style={{ color: "#C9D6CD" }}>{gameWeather.humidity}%</b> · Viento: <b style={{ color: "#C9D6CD" }}>{gameWeather.windMph.toFixed(1)} mph {gameWeather.windDir}</b> · P.O.P: <b style={{ color: "#C9D6CD" }}>{gameWeather.pop}%</b>
                  </div>
                  <div className="ml-auto">
                    <WindFieldIcon deg={gameWeather.windDirDeg} mph={gameWeather.windMph} orientationDeg={HOME_PLATE_ORIENTATION[selectedGame.homeCode]} />
                  </div>
                </div>
              )}
              {weatherStatus === "idle" && stadium.roofed && (
                <p className="text-[11px]" style={{ color: "#5A7368" }}>Estadio con techo cerrado — el clima no afecta este juego.</p>
              )}
            </div>
          )}

          {/* Calidad real de bullpen */}
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Calidad real del bullpen</div>
            {bullpenStatus === "cargando" && <p className="text-[11px]" style={{ color: "#8FA599" }}>Consultando relevistas reales…</p>}
            {bullpenStatus === "listo" && (
              <div className="grid grid-cols-2 gap-3">
                {[{ code: selectedGame.awayCode, tag: "Visitante" }, { code: selectedGame.homeCode, tag: "Local" }].map(({ code, tag }) => {
                  const bp = gameBullpen[code];
                  return (
                    <div key={code} className="text-[11px]" style={{ color: "#8FA599" }}>
                      <div className="font-semibold mb-1" style={{ color: "#EDEAE1" }}>{code} · {tag}</div>
                      <div>ERA: <b style={{ color: bp?.bullpenERA != null ? (bp.bullpenERA < 3.5 ? "#FFB627" : bp.bullpenERA > 4.5 ? "#C8393E" : "#C9D6CD") : "#8FA599" }}>{bp?.bullpenERA ?? "—"}</b> · WHIP: <b style={{ color: "#C9D6CD" }}>{bp?.bullpenWHIP ?? "—"}</b></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Récord real situacional */}
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
              Récord real hoy ({selectedGame.dayNight === "day" ? "de día" : selectedGame.dayNight === "night" ? "de noche" : "—"} · {["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][new Date().getDay()]})
            </div>
            {situationalStatus === "cargando" && <p className="text-[11px]" style={{ color: "#8FA599" }}>Calculando récords reales…</p>}
            {situationalStatus === "listo" && (
              <div className="grid grid-cols-2 gap-3">
                {[{ code: selectedGame.awayCode, tag: "Visitante" }, { code: selectedGame.homeCode, tag: "Local" }].map(({ code, tag }) => {
                  const s = gameSituational[code];
                  const todayWd = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][new Date().getDay()];
                  const dn = s && selectedGame.dayNight ? (selectedGame.dayNight === "day" ? s.dayRecord : s.nightRecord) : null;
                  const wd = s?.byWeekday?.[todayWd];
                  return (
                    <div key={code} className="text-[11px]" style={{ color: "#8FA599" }}>
                      <div className="font-semibold mb-1" style={{ color: "#EDEAE1" }}>{code} · {tag}</div>
                      <div>{selectedGame.dayNight === "day" ? "De día" : "De noche"}: <b style={{ color: "#C9D6CD" }}>{dn ? `${dn.w}-${dn.l}` : "—"}</b></div>
                      <div>{todayWd}: <b style={{ color: "#C9D6CD" }}>{wd ? `${wd.w}-${wd.l}` : "—"}</b></div>
                      <div>Últimos 10: <b style={{ color: "#FFB627" }}>{s?.last10Record ? `${s.last10Record.w}-${s.last10Record.l}` : "—"}</b></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Historial real cara a cara entre estos dos equipos */}
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
              Historial real cara a cara — temporada {new Date().getFullYear()}
            </div>
            {headToHeadStatus === "cargando" && <p className="text-[11px]" style={{ color: "#8FA599" }}>Calculando enfrentamientos reales…</p>}
            {headToHeadStatus === "error" && <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo traer el historial real.</p>}
            {headToHeadStatus === "listo" && headToHead && (
              <>
                {headToHead.gamesPlayed === 0 ? (
                  <p className="text-[11px]" style={{ color: "#8FA599" }}>No se han enfrentado todavía esta temporada.</p>
                ) : (
                  <div className="text-[11px]" style={{ color: "#8FA599" }}>
                    <span style={{ color: "#EDEAE1" }}>{selectedGame.homeCode}</span> <b style={{ color: "#FFB627" }}>{headToHead.homeTeamWins}</b>
                    {" — "}
                    <b style={{ color: "#FFB627" }}>{headToHead.awayTeamWins}</b> <span style={{ color: "#EDEAE1" }}>{selectedGame.awayCode}</span>
                    {" "}({headToHead.gamesPlayed} juegos esta temporada)
                    {headToHead.gamesPlayed < 3 && (
                      <span> — muestra muy chica todavía, no se usa para ajustar la probabilidad hasta llegar a 3 juegos</span>
                    )}
                  </div>
                )}
                {headToHead.overUnder && (headToHead.overUnder.overCount + headToHead.overUnder.underCount) > 0 && (
                  <div className="text-[11px] mt-2 pt-2" style={{ color: "#8FA599", borderTop: "1px dashed #2A4D3B" }}>
                    Over/Under real (línea {headToHead.overUnder.referenceLine}): <b style={{ color: "#FFB627" }}>{headToHead.overUnder.overCount} Over</b> — <b style={{ color: "#FFB627" }}>{headToHead.overUnder.underCount} Under</b>
                    {headToHead.overUnder.avgTotalRuns != null && <span> · promedio real de {headToHead.overUnder.avgTotalRuns} carreras combinadas entre ellos</span>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Descanso/fatiga real de ambos equipos */}
          <div className="mb-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
            <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>
              Descanso real antes de este juego
            </div>
            {restStatus === "cargando" && <p className="text-[11px]" style={{ color: "#8FA599" }}>Calculando descanso real…</p>}
            {restStatus === "listo" && (
              <div className="grid grid-cols-2 gap-3">
                {[{ code: selectedGame.awayCode, tag: "Visitante" }, { code: selectedGame.homeCode, tag: "Local" }].map(({ code, tag }) => {
                  const rest = gameRest[code];
                  const isGetaway = rest?.daysRested === 0 && rest?.lastGameDayNight === "night" && selectedGame.dayNight === "day";
                  return (
                    <div key={code} className="text-[11px]" style={{ color: "#8FA599" }}>
                      <div className="font-semibold mb-1" style={{ color: "#EDEAE1" }}>{code} · {tag}</div>
                      {rest?.daysRested == null ? (
                        <div>—</div>
                      ) : (
                        <>
                          <div>{rest.daysRested === 0 ? "Sin descanso (jugó ayer)" : `${rest.daysRested} día(s) de descanso`}</div>
                          {isGetaway && <div style={{ color: "#C8393E" }}>⚠ Getaway day (de noche a de día)</div>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {hittersLoadStatus === "listo" && gameHitters.length > 0 && (
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              <div className="text-[10px] font-semibold px-2 py-1 rounded-full inline-block" style={{ background: lineupAvailable ? "#1A362A" : "#12281E", color: lineupAvailable ? "#3FC97A" : "#8FA599" }}>
                {lineupAvailable ? "✓ Alineación real de hoy confirmada" : "Alineación aún no publicada — usando roster activo completo"}
              </div>
              {lineupAvailable && lineupData && (
                <button
                  onClick={() => setShowLineup((v) => !v)}
                  className="text-[10px] font-semibold px-2 py-1 rounded-full"
                  style={{ background: "#12281E", color: "#FFB627", border: "1px solid #1F3D30" }}
                >
                  {showLineup ? "Ocultar alineación ▲" : "Ver alineación ▾"}
                </button>
              )}
            </div>
          )}
          {showLineup && lineupData && (
            <div className="mb-4 grid grid-cols-2 gap-4 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div>
                <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>{selectedGame.awayCode} · Visitante</div>
                <ol className="space-y-1">
                  {(lineupData.away || []).map((p, i) => (
                    <li key={i} className="text-[11px] flex justify-between" style={{ color: "#C9D6CD" }}>
                      <span>{i + 1}. {p.name}</span><span style={{ color: "#8FA599" }}>{p.pos}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>{selectedGame.homeCode} · Local</div>
                <ol className="space-y-1">
                  {(lineupData.home || []).map((p, i) => (
                    <li key={i} className="text-[11px] flex justify-between" style={{ color: "#C9D6CD" }}>
                      <span>{i + 1}. {p.name}</span><span style={{ color: "#8FA599" }}>{p.pos}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          {hittersLoadStatus === "cargando" && (
            <p className="text-[11px]" style={{ color: "#8FA599" }}>Calculando probabilidades de los bateadores de ambos equipos…</p>
          )}
          {hittersLoadStatus === "error" && (
            <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudieron traer los bateadores de este partido.</p>
          )}
          {hittersLoadStatus === "listo" && gameHitters.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { key: "hit", label: "Hit", color: "#FFB627" },
                  { key: "single", label: "Sencillo", color: "#8FA599" },
                  { key: "double", label: "Doble", color: "#5A9BC8" },
                  { key: "hr", label: "Jonrón", color: "#C8393E" },
                ].map((cat) => (
                  <div key={cat.key}>
                    <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: cat.color }}>{cat.label}</div>
                    <div className="space-y-1.5">
                      {topBy(cat.key).map((p, i) => (
                        <div key={p.name + cat.key} className="flex items-center justify-between text-[11px]">
                          <span style={{ color: "#EDEAE1" }}>
                            {i + 1}. {p.name} <span style={{ color: "#8FA599" }}>({p.team})</span>
                            {cat.key === "hit" && hitStreaks[p.id] != null && hitStreaks[p.id] >= 2 && (
                              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#1A362A", color: "#3FC97A" }}>
                                {hitStreaks[p.id]}/{hitStreaks[p.id]}
                              </span>
                            )}
                          </span>
                          <span className="font-bold tabular-nums" style={{ color: cat.color, fontFamily: "ui-monospace, monospace" }}>
                            {p[cat.key].toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] mt-3 leading-relaxed" style={{ color: "#5A7368" }}>
                Probabilidad de que ocurra al menos una vez en el juego, con datos reales de temporada y cruzada
                con el abridor probable rival (mano + ERA cuando está confirmado). No es el split personal de cada
                jugador contra ese pitcher específico, es un ajuste de liga general. El "X/X" junto al nombre en "Hit" es su racha REAL de juegos consecutivos con al menos un hit (solo aparece si lleva 2 o más), calculada de su historial real de esta temporada.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Sin juego seleccionado: mostramos la lista completa.
  return (
    <div className="mb-6">
      <div className="text-[11px] tracking-widest uppercase mb-2" style={{ color: "#8FA599" }}>Juegos de hoy</div>
      <div className="flex flex-col gap-2.5">
        {games.map((g) => {
          const time = g.time
            ? new Date(g.time).toLocaleTimeString("es", { hour: "numeric", minute: "2-digit", hour12: true })
            : "";
          return (
            <button
              key={g.gamePk}
              onClick={() => selectGame(g)}
              className="w-full px-3.5 py-2.5 rounded-lg border text-left transition-colors flex items-center justify-between"
              style={{ background: "#12281E", borderColor: "#1F3D30" }}
            >
              <div className="text-xs font-semibold" style={{ color: "#EDEAE1" }}>
                {g.awayCode || g.away} @ {g.homeCode || g.home}
              </div>
              <div className="text-[10px]" style={{ color: "#8FA599" }}>{time} · {g.status}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DailyPicks() {
  const [liveAllHitters, setLiveAllHitters] = useState(null); // null = aún cargando
  const [loadStatus, setLoadStatus] = useState("cargando"); // "cargando" | "listo" | "error"
  const [teamsPlayingToday, setTeamsPlayingToday] = useState(null); // null = aún cargando; luego Set de códigos
  const [opponentOf, setOpponentOf] = useState({}); // { [teamCode]: rivalCode } — quién juega contra quién hoy

  // Trae los juegos reales de hoy, para saber QUÉ equipos juegan Y contra
  // QUIÉN — Picks del día debe mostrar solo jugadores y equipos con
  // partido hoy, y nunca mostrar a dos equipos que se enfrentan entre sí
  // como si ambos "fueran a ganar" (eso es imposible en el mismo juego).
  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/games/today`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const set = new Set();
        const opp = {};
        for (const g of data.games || []) {
          if (g.homeCode) set.add(g.homeCode);
          if (g.awayCode) set.add(g.awayCode);
          if (g.homeCode && g.awayCode) {
            opp[g.homeCode] = g.awayCode;
            opp[g.awayCode] = g.homeCode;
          }
        }
        setTeamsPlayingToday(set);
        setOpponentOf(opp);
      })
      .catch(() => { if (!cancelled) setTeamsPlayingToday(new Set()); });
    return () => { cancelled = true; };
  }, []);

  // Trae bateadores reales de los 30 equipos (en paralelo) para calcular el
  // top del día con datos genuinamente en vivo, no una lista fija curada.
  // El backend cachea cada equipo 15 minutos, así que esto no golpea la
  // MLB Stats API de más en visitas seguidas.
  useEffect(() => {
    let cancelled = false;
    const codes = Object.keys(TEAM_IDS);
    Promise.all(
      codes.map((code) =>
        fetch(`${BACKEND_URL}/api/team/${code}/hitters`)
          .then((r) => r.json())
          .then((data) => (data.hitters || []).map((h) => ({ ...h, team: code })))
          .catch(() => [])
      )
    )
      .then((results) => {
        if (cancelled) return;
        const all = results.flat().filter((h) => h.ab > 0 && h.g > 0);
        setLiveAllHitters(all);
        setLoadStatus("listo");
      })
      .catch(() => { if (!cancelled) setLoadStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  // Solo bateadores de equipos con partido real hoy — si el dato de juegos
  // de hoy aún no cargó, no filtramos (mejor mostrar algo que nada), pero
  // en cuanto llega, se aplica el filtro real.
  const eligibleHitters = (liveAllHitters || []).filter(
    (p) => !teamsPlayingToday || teamsPlayingToday.size === 0 || teamsPlayingToday.has(p.team)
  );

  const topHitters = eligibleHitters
    .map((p) => ({ player: p, prob: toGameProbability(hitProbabilities(p).hit, p.ab / p.g) }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 3);

  // Top 3 equipos por probabilidad de ganar hoy — solo entre equipos con
  // partido real. Si dos equipos del top se enfrentan ENTRE SÍ hoy, no
  // pueden aparecer los dos como "van a ganar" (es el mismo juego) — se
  // resuelve con Log5 real cabeza a cabeza, y solo se queda el que
  // realmente favorece esa comparación directa.
  const eligibleTeamCodes = Object.keys(TEAM_RECORDS).filter(
    (code) => !teamsPlayingToday || teamsPlayingToday.size === 0 || teamsPlayingToday.has(code)
  );
  const seenMatchups = new Set();
  const teamCandidates = [];
  for (const code of eligibleTeamCodes) {
    const rival = opponentOf[code];
    if (rival && eligibleTeamCodes.includes(rival)) {
      const matchupKey = [code, rival].sort().join("-");
      if (seenMatchups.has(matchupKey)) continue;
      seenMatchups.add(matchupKey);
      const headToHeadProb = log5(TEAM_RECORDS[code].wpct, TEAM_RECORDS[rival].wpct);
      const winnerCode = headToHeadProb >= 0.5 ? code : rival;
      const winnerProb = headToHeadProb >= 0.5 ? headToHeadProb : 1 - headToHeadProb;
      teamCandidates.push({ code: winnerCode, rec: TEAM_RECORDS[winnerCode], prob: winnerProb });
    } else {
      teamCandidates.push({ code, rec: TEAM_RECORDS[code], prob: log5(TEAM_RECORDS[code].wpct, 0.5) });
    }
  }
  const topTeams = teamCandidates.sort((a, b) => b.prob - a.prob).slice(0, 3);

  // Guarda automáticamente los picks del día (los 3 bateadores y los 3
  // equipos) en cuanto están listos, para poder comparar después contra
  // el resultado real — igual que hacemos con las predicciones de juegos.
  useEffect(() => {
    if (loadStatus !== "listo" || topHitters.length === 0 || topTeams.length === 0) return;
    const pickDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const picks = [
      ...topHitters.map(({ player, prob }) => ({
        pick_date: pickDate, pick_type: "batter",
        player_id: player.id || null, player_name: player.name, team_code: player.team,
        predicted_prob: prob / 100, // prob viene en escala 0-100, lo pasamos a 0-1 para guardarlo parejo con los equipos
      })),
      ...topTeams.map(({ code, rec, prob }) => ({
        pick_date: pickDate, pick_type: "team",
        player_id: null, player_name: rec.name, team_code: code,
        predicted_prob: prob,
      })),
    ];
    fetch(`${BACKEND_URL}/api/picks/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks }),
    }).catch(() => {});
  }, [loadStatus, teamsPlayingToday]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
        <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>
          Picks del día · bateadores
        </div>
        <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
          Mayor probabilidad de hit hoy
        </h2>
        {loadStatus === "cargando" && (
          <p className="text-[11px]" style={{ color: "#8FA599" }}>Consultando bateadores reales de los 30 equipos…</p>
        )}
        {loadStatus === "error" && (
          <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend en vivo ahora mismo.</p>
        )}
        {loadStatus === "listo" && (
          <div className="space-y-3">
            {topHitters.map(({ player, prob }, i) => (
              <div key={player.name + player.team} className="flex items-center gap-3 p-3 rounded-lg border" style={{ background: "#12281E", borderColor: i === 0 ? "#FFB627" : "#1F3D30" }}>
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
        )}
        <p className="text-[10px] mt-3 leading-relaxed" style={{ color: "#5A7368" }}>
          Probabilidad de conseguir al menos un hit en el juego, calculada con datos reales — solo entre jugadores cuyo equipo tiene partido real hoy. No ajustada por el pitcher rival específico.
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
        <p className="text-[10px] mt-2.5 leading-relaxed" style={{ color: "#5A7368" }}>
          Probabilidad Log5 contra un rival promedio de liga (.500) — solo entre equipos con partido real hoy. Refleja su nivel general de temporada, no el rival específico de hoy (para eso, entra al partido en Juegos de hoy).
        </p>
      </div>
    </div>
  );
}


function AccuracyView() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("cargando"); // "cargando" | "listo" | "error"
  const [checking, setChecking] = useState(false);

  const load = () => {
    setStatus("cargando");
    fetch(`${BACKEND_URL}/api/predictions/accuracy`)
      .then((r) => r.json())
      .then((d) => { setData(d); setStatus("listo"); })
      .catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, []);

  const checkNow = () => {
    setChecking(true);
    fetch(`${BACKEND_URL}/api/predictions/check`, { method: "POST" })
      .then((r) => r.json())
      .then(() => { load(); setChecking(false); })
      .catch(() => setChecking(false));
  };

  // Precisión de Picks del día — misma idea, pero para los 3 bateadores y
  // 3 equipos que la app recomienda cada día en esa pestaña.
  const [picksData, setPicksData] = useState(null);
  const [picksStatus, setPicksStatus] = useState("cargando");
  const [checkingPicks, setCheckingPicks] = useState(false);

  const loadPicks = () => {
    setPicksStatus("cargando");
    fetch(`${BACKEND_URL}/api/picks/accuracy`)
      .then((r) => r.json())
      .then((d) => { setPicksData(d); setPicksStatus("listo"); })
      .catch(() => setPicksStatus("error"));
  };

  useEffect(() => { loadPicks(); }, []);

  const checkPicksNow = () => {
    setCheckingPicks(true);
    fetch(`${BACKEND_URL}/api/picks/check`, { method: "POST" })
      .then((r) => r.json())
      .then(() => { loadPicks(); setCheckingPicks(false); })
      .catch(() => setCheckingPicks(false));
  };

  return (
    <div className="space-y-6">
    <div className="rounded-xl border p-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>
        Backtesting real — Fase 2
      </div>
      <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
        ¿Qué tan certero es el modelo?
      </h2>

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
          Todavía no hay predicciones comparadas contra resultados reales. La app guarda una predicción real cada vez que visitas un partido en Juegos de hoy — vuelve en unos días, cuando esos juegos ya hayan terminado, y presiona "Revisar predicciones de días anteriores".
        </p>
      )}

      {status === "listo" && data && data.totalChecked > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3.5 rounded-lg border text-center" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-2xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                {(data.accuracy * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] tracking-widest uppercase mt-1" style={{ color: "#8FA599" }}>Acertó al favorito</div>
            </div>
            <div className="p-3.5 rounded-lg border text-center" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-2xl font-black tabular-nums" style={{ color: data.brierScore < 0.25 ? "#3FC97A" : "#C8393E", fontFamily: "ui-monospace, monospace" }}>
                {data.brierScore.toFixed(3)}
              </div>
              <div className="text-[10px] tracking-widest uppercase mt-1" style={{ color: "#8FA599" }}>Brier Score (0=perfecto, 0.25=azar)</div>
            </div>
          </div>
          <div className="text-[11px] mb-2" style={{ color: "#8FA599" }}>Basado en {data.totalChecked} predicciones reales comparadas.</div>

          <div className="text-[10px] tracking-widest uppercase mb-2 mt-4" style={{ color: "#8FA599" }}>Últimas comparaciones</div>
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

      <p className="text-[10px] mt-4 leading-relaxed" style={{ color: "#5A7368" }}>
        "Acertó al favorito" es simple: ¿ganó quien el modelo daba como más probable? El Brier Score es la métrica real de calibración — mide qué tan cerca estuvo el % exacto del resultado real, no solo si acertó la dirección. Un modelo honesto no necesita acertar siempre, necesita estar bien calibrado.
      </p>
    </div>

    <PicksAccuracyView picksData={picksData} picksStatus={picksStatus} checkingPicks={checkingPicks} checkPicksNow={checkPicksNow} />
    </div>
  );
}

function PicksAccuracyView({ picksData, picksStatus, checkingPicks, checkPicksNow }) {
  return (
    <div className="rounded-xl border p-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
      <div className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "#8FA599" }}>
        Backtesting real — Picks del día
      </div>
      <h2 className="text-xl font-bold mb-4" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
        ¿Qué tan certeros son los Picks del día?
      </h2>

      <button
        onClick={checkPicksNow}
        disabled={checkingPicks}
        className="mb-4 px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: "#1A362A", color: "#FFB627", border: "1px solid #2A4D3B", opacity: checkingPicks ? 0.6 : 1 }}
      >
        {checkingPicks ? "Revisando resultados reales…" : "Revisar picks de días anteriores"}
      </button>

      {picksStatus === "cargando" && <p className="text-[11px]" style={{ color: "#8FA599" }}>Cargando…</p>}
      {picksStatus === "error" && <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo conectar con el backend.</p>}

      {picksStatus === "listo" && picksData && picksData.batters.total === 0 && picksData.teams.total === 0 && (
        <p className="text-[13px]" style={{ color: "#8FA599" }}>
          Todavía no hay picks comparados contra resultados reales. La app guarda los picks del día automáticamente cada vez que abres esa pestaña — vuelve en unos días y presiona "Revisar picks de días anteriores".
        </p>
      )}

      {picksStatus === "listo" && picksData && (picksData.batters.total > 0 || picksData.teams.total > 0) && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3.5 rounded-lg border text-center" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-2xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                {picksData.batters.accuracy != null ? `${(picksData.batters.accuracy * 100).toFixed(1)}%` : "—"}
              </div>
              <div className="text-[10px] tracking-widest uppercase mt-1" style={{ color: "#8FA599" }}>Bateadores acertados ({picksData.batters.total})</div>
            </div>
            <div className="p-3.5 rounded-lg border text-center" style={{ background: "#12281E", borderColor: "#1F3D30" }}>
              <div className="text-2xl font-black tabular-nums" style={{ color: "#FFB627", fontFamily: "ui-monospace, monospace" }}>
                {picksData.teams.accuracy != null ? `${(picksData.teams.accuracy * 100).toFixed(1)}%` : "—"}
              </div>
              <div className="text-[10px] tracking-widest uppercase mt-1" style={{ color: "#8FA599" }}>Equipos acertados ({picksData.teams.total})</div>
            </div>
          </div>

          <div className="text-[10px] tracking-widest uppercase mb-2 mt-4" style={{ color: "#8FA599" }}>Últimos picks comparados</div>
          <div className="space-y-1.5">
            {picksData.recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] p-2 rounded" style={{ background: "#12281E" }}>
                <span style={{ color: "#C9D6CD" }}>{r.date} · {r.name} <span style={{ color: "#8FA599" }}>({r.team})</span></span>
                <span style={{ color: "#8FA599" }}>{r.type === "batter" ? "Bateador" : "Equipo"} · {(r.prob * 100).toFixed(0)}%</span>
                <span style={{ color: r.success ? "#3FC97A" : "#C8393E", fontWeight: 700 }}>
                  {r.success ? "✓ acertó" : "✗ falló"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-[10px] mt-4 leading-relaxed" style={{ color: "#5A7368" }}>
        Para bateadores: ¿de verdad consiguió al menos un hit ese día? Para equipos: ¿de verdad ganó ese día? Datos reales, comparados juego por juego — no es el mismo backtesting que "Probabilidad de ganar", esto mide específicamente qué tan buenos son los picks que ves en esa pestaña.
      </p>
    </div>
  );
}

export default function DiamondStats({ onBackToMenu }) {
  const [view, setView] = useState("jugadores");
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("Todos");
  const [selectedId, setSelectedId] = useState(PLAYERS[0].id);
  const [oppTeam, setOppTeam] = useState(null);
  const [playerDetailOpen, setPlayerDetailOpen] = useState(false);
  const [teamDayNight, setTeamDayNight] = useState({}); // { [teamCode]: "day" | "night" } — solo equipos que juegan hoy

  // Trae el día/noche REAL de los partidos de hoy, para poder cruzar cada
  // jugador con el horario real de su propio equipo (no con la hora del
  // reloj de quien esté usando la app).
  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/games/today`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.games) return;
        const map = {};
        for (const g of data.games) {
          if (g.homeCode && g.dayNight) map[g.homeCode] = g.dayNight;
          if (g.awayCode && g.dayNight) map[g.awayCode] = g.dayNight;
        }
        setTeamDayNight(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [liveStatus, setLiveStatus] = useState("cargando"); // "cargando" | "en-vivo" | "respaldo"
  const [liveHitters, setLiveHitters] = useState({}); // { [teamCode]: player[] } — roster en vivo por equipo
  const [hittersStatus, setHittersStatus] = useState("idle"); // "idle" | "cargando" | "listo" | "error"
  const [livePitchers, setLivePitchers] = useState({}); // { [teamCode]: player[] } — pitchers en vivo por equipo
  const [pitchersStatus, setPitchersStatus] = useState("idle"); // "idle" | "cargando" | "listo" | "error"
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
            vsL: h.vsL, vsR: h.vsR, // splits reales — sin esto el modelo caía siempre al ajuste genérico
            vsDay: h.vsDay, vsNight: h.vsNight, // splits reales de día/noche
          }));
        setLiveHitters((prev) => ({ ...prev, [team]: mapped }));
        setHittersStatus("listo");
      })
      .catch(() => { if (!cancelled) setHittersStatus("error"); });
    return () => { cancelled = true; };
  }, [team]);

  // Igual que arriba, pero para pitchers reales del equipo seleccionado.
  useEffect(() => {
    if (team === "Todos" || livePitchers[team]) return;
    let cancelled = false;
    setPitchersStatus("cargando");
    fetch(`${BACKEND_URL}/api/team/${team}/pitchers`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.pitchers) return;
        const mapped = data.pitchers
          .filter((p) => p.era != null && p.whip != null && p.k9 != null && p.so != null && p.w != null && p.l != null)
          .map((p, i) => ({
            id: `live-pitcher-${team}-${i}`,
            name: p.name, team, pos: p.gs > p.g / 2 ? "SP" : "RP", type: "pitcher",
            throws: p.throws === "L" || p.throws === "R" ? p.throws : null,
            era: p.era, whip: p.whip, so: p.so, ip: p.ip, w: p.w, l: p.l, k9: p.k9,
            trend: "flat",
          }));
        setLivePitchers((prev) => ({ ...prev, [team]: mapped }));
        setPitchersStatus("listo");
      })
      .catch(() => { if (!cancelled) setPitchersStatus("error"); });
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
    if (team === "Todos") return PLAYERS;
    // Si un jugador está curado a mano Y también llega en vivo del backend
    // (como Ben Rice), preferimos la versión EN VIVO — tiene datos más
    // completos (splits reales vs. zurdo/derecho) que la curada no tiene.
    const liveNamesThisTeam = new Set([...(liveHitters[team] || []), ...(livePitchers[team] || [])].map((p) => p.name));
    const curatedRest = PLAYERS.filter((p) => !(p.team === team && liveNamesThisTeam.has(p.name)));
    return [...curatedRest, ...(liveHitters[team] || []), ...(livePitchers[team] || [])];
  }, [team, liveHitters, livePitchers]);

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
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setView("juegos")}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
            style={{
              background: view === "juegos" ? "#FFB627" : "#12281E",
              color: view === "juegos" ? "#0B1F17" : "#8FA599",
              border: "1px solid " + (view === "juegos" ? "#FFB627" : "#1F3D30"),
            }}
          >
            Juegos de hoy
          </button>
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
          <button
            onClick={() => setView("precision")}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
            style={{
              background: view === "precision" ? "#FFB627" : "#12281E",
              color: view === "precision" ? "#0B1F17" : "#8FA599",
              border: "1px solid " + (view === "precision" ? "#FFB627" : "#1F3D30"),
            }}
          >
            Precisión
          </button>
        </div>

        {view === "juegos" ? (
          <TodayGamesHeader />
        ) : view === "picks" ? (
          <DailyPicks />
        ) : view === "precision" ? (
          <AccuracyView />
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
            {pitchersStatus === "listo" && livePitchers[team]?.length > 0 && (
              <p className="text-[11px]" style={{ color: "#3FC97A" }}>
                +{livePitchers[team].length} pitchers en vivo de {team} agregados, con ERA, WHIP y K/9 reales de la temporada.
              </p>
            )}
            {pitchersStatus === "error" && (
              <p className="text-[11px]" style={{ color: "#8FA599" }}>No se pudo traer el pitcheo en vivo de {team}.</p>
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
              Abridor: <b style={{ color: "#EDEAE1" }}>{PITCHERS[oppTeam].name}</b> · {PITCHERS[oppTeam].hand === "L" ? "zurdo" : PITCHERS[oppTeam].hand === "R" ? "derecho" : "mano no confirmada"} · {PITCHERS[oppTeam].eraConfirmed ? `${PITCHERS[oppTeam].era.toFixed(2)} ERA` : "ERA no confirmado"}
            </span>
          )}
        </div>

        {playerDetailOpen ? (
        <div>
          <button
            onClick={() => setPlayerDetailOpen(false)}
            className="text-[11px] font-semibold mb-3 flex items-center gap-1"
            style={{ color: "#FFB627" }}
          >
            ← Volver a jugadores
          </button>
          <div className="max-w-2xl">
            <div className="rounded-xl border p-6" style={{ background: "#0F251C", borderColor: "#1F3D30" }}>
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
                  <HitProbabilities player={selected} pitcher={oppTeam ? PITCHERS[oppTeam] : null} todaysDayNight={teamDayNight[selected.team] || null} />
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
        ) : (
          <div>
            {filtered.length === 0 && (
              <div className="text-sm py-8 text-center" style={{ color: "#8FA599" }}>Sin resultados para "{query}"</div>
            )}
            <div className="space-y-2.5">
              {filtered.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  active={p.id === selected.id}
                  onClick={() => { setSelectedId(p.id); setPlayerDetailOpen(true); }}
                />
              ))}
            </div>
          </div>
        )}
        </>
        )}

        <p className="text-center text-[11px] mt-8" style={{ color: "#4E6459" }}>
          Bateo: datos reales temporada 2026 (MLB.com). Juegos de hoy: récords + Log5 + localía + park factors + platoon + ERA real + bullpen + forma reciente, todo con datos en vivo.
        </p>
      </div>
    </div>
  );
}

function HitProbabilities({ player, pitcher, todaysDayNight }) {
  const [mode, setMode] = useState("game");
  const perAb = matchupAdjustedProbs(player, pitcher, todaysDayNight);
  const perGame = gameProbabilities(player, pitcher, todaysDayNight);
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
              vs. {pitcher.name} ({pitcher.eraConfirmed ? `${pitcher.era.toFixed(2)} ERA` : "ERA no confirmado"}) · {p.favorable ? "ventaja" : "desventaja"} de platoon {p.usedRealSplit ? "(split real)" : "(promedio liga)"}
            </div>
          )}
          {p.usedDayNightSplit && (
            <div className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#1A362A", color: "#3FC97A" }}>
              {todaysDayNight === "day" ? "vs. juego de día de hoy" : "vs. juego de noche de hoy"} (split real)
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
          ? ` Cruzado con el abridor real de hoy: ${p.usedRealSplit ? "su split REAL contra esa mano esta temporada" : "el ajuste de platoon genérico de liga (no tiene muestra suficiente de su split real todavía)"} + su ERA ${pitcher.eraConfirmed ? `actual de ${pitcher.era.toFixed(2)}` : "(sin confirmar esta sesión, se usa el promedio de liga como neutral)"} vs. el promedio de liga (~4.00). ${p.usedRealSplit ? "No es contra este pitcher específico, es su split contra pitchers de esa mano en general." : ""}`
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
