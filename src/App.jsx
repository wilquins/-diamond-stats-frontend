import React, { useState } from "react";
import DiamondStats from "./MLB/DiamondStats.jsx";
import DiamondStatsNFL from "./NFL/DiamondStatsNFL.jsx";

// ---- Íconos propios por deporte — mismo estilo de línea que ya usa MLB
// (dorado, minimalista), en vez de emojis genéricos. ----
function BaseballIcon({ active }) {
  const stroke = active ? "#FFB627" : "#5A7368";
  return (
    <svg viewBox="0 0 64 64" width="40" height="40">
      <circle cx="32" cy="32" r="26" fill="none" stroke={stroke} strokeWidth="2.5" />
      <path d="M14 14 Q32 26 14 50" fill="none" stroke={stroke} strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M50 14 Q32 26 50 50" fill="none" stroke={stroke} strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  );
}
function BasketballIcon({ active }) {
  const stroke = active ? "#FFB627" : "#5A7368";
  return (
    <svg viewBox="0 0 64 64" width="40" height="40">
      <circle cx="32" cy="32" r="26" fill="none" stroke={stroke} strokeWidth="2.5" />
      <path d="M32 6 V58 M6 32 H58" stroke={stroke} strokeWidth="1.5" />
      <path d="M12 12 Q32 32 12 52 M52 12 Q32 32 52 52" fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}
function FootballIcon({ active }) {
  const stroke = active ? "#FFB627" : "#5A7368";
  return (
    <svg viewBox="0 0 64 64" width="40" height="40">
      <ellipse cx="32" cy="32" rx="24" ry="15" fill="none" stroke={stroke} strokeWidth="2.5" />
      <line x1="15" y1="32" x2="49" y2="32" stroke={stroke} strokeWidth="1.5" />
      <line x1="26" y1="27" x2="26" y2="37" stroke={stroke} strokeWidth="1.5" />
      <line x1="32" y1="27" x2="32" y2="37" stroke={stroke} strokeWidth="1.5" />
      <line x1="38" y1="27" x2="38" y2="37" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}
function HockeyIcon({ active }) {
  const stroke = active ? "#FFB627" : "#5A7368";
  return (
    <svg viewBox="0 0 64 64" width="40" height="40">
      <ellipse cx="32" cy="40" rx="18" ry="7" fill="none" stroke={stroke} strokeWidth="2.5" />
      <path d="M20 40 L14 12 Q13 8 17 8 L22 8" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const SPORTS = [
  { id: "mlb", name: "MLB", Icon: BaseballIcon, ready: true, tagline: "Béisbol", stats: ["30 equipos en vivo", "Predicciones reales", "Backtesting real"] },
  { id: "nfl", name: "NFL", Icon: FootballIcon, ready: true, tagline: "Fútbol americano", stats: ["Calendario real", "Tabla de posiciones", "Fase 1"] },
  { id: "nba", name: "NBA", Icon: BasketballIcon, ready: false, tagline: "Básquetbol" },
  { id: "nhl", name: "NHL", Icon: HockeyIcon, ready: false, tagline: "Hockey" },
];

function SportLanding({ onSelect }) {
  const readySports = SPORTS.filter((s) => s.ready);
  const upcoming = SPORTS.filter((s) => !s.ready);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#0B1F17" }}>
      <div className="w-full max-w-2xl">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: "#C8393E" }} />
            <span className="text-[11px] tracking-[0.25em] uppercase" style={{ color: "#8FA599", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
              Analítica deportiva en vivo
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif", letterSpacing: "-0.02em" }}>
            DIAMOND<span style={{ color: "#FFB627" }}>STATS</span>
          </h1>
          <p className="text-sm mt-2" style={{ color: "#8FA599" }}>Elige un deporte para empezar</p>
          <div className="mt-4 h-px w-full" style={{ background: "repeating-linear-gradient(90deg, #C8393E 0 10px, transparent 10px 20px)" }} />
        </div>

        {/* Deportes activos — tarjetas grandes y vivas */}
        {readySports.map((sport) => (
          <button
            key={sport.id}
            onClick={() => onSelect(sport.id)}
            className="w-full p-6 rounded-2xl border text-left transition-transform hover:scale-[1.01] mb-4"
            style={{ background: "#12281E", borderColor: "#FFB627" }}
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <sport.Icon active />
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-xl font-bold" style={{ color: "#EDEAE1" }}>{sport.name}</div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "#1A362A" }}>
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#3FC97A" }} />
                      <span className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "#3FC97A" }}>En vivo</span>
                    </div>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "#8FA599" }}>{sport.tagline}</div>
                </div>
              </div>
              <div className="text-2xl" style={{ color: "#FFB627" }}>→</div>
            </div>
            {sport.stats && (
              <div className="flex gap-2 mt-4 flex-wrap">
                {sport.stats.map((s) => (
                  <span key={s} className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: "#0F251C", color: "#8FA599", fontFamily: "ui-monospace, monospace" }}>
                    {s}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}

        {/* Los demás — reservados, mismo estilo pero apagados */}
        {upcoming.length > 0 && (
          <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: `repeat(${upcoming.length}, minmax(0, 1fr))` }}>
            {upcoming.map((sport) => (
              <div
                key={sport.id}
                className="p-4 rounded-xl border text-center"
                style={{ background: "#12281E", borderColor: "#1F3D30", opacity: 0.55 }}
              >
                <div className="flex justify-center"><sport.Icon /></div>
                <div className="text-sm font-bold mt-2" style={{ color: "#EDEAE1" }}>{sport.name}</div>
                <div className="text-[10px] mt-1" style={{ color: "#5A7368" }}>Próximamente</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [sport, setSport] = useState(null);

  if (sport === "mlb") return <DiamondStats onBackToMenu={() => setSport(null)} />;
  if (sport === "nfl") return <DiamondStatsNFL onBackToMenu={() => setSport(null)} />;

  // nba/nhl no son seleccionables todavía (botón deshabilitado en
  // SportLanding), así que si algún día se activan sin tener su
  // componente listo, esto evita una pantalla en blanco.
  if (sport === "nba" || sport === "nhl") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B1F17", color: "#8FA599" }}>
        Próximamente — vuelve pronto.
      </div>
    );
  }

  return <SportLanding onSelect={setSport} />;
}

