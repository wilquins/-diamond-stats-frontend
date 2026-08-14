import React, { useState } from "react";
import DiamondStats from "./MLB/DiamondStats.jsx";

// ---- Ventana principal: selector de deporte ----
// MLB ya está construido y funcionando (carpeta /mlb). Los otros 3 quedan
// como espacio reservado — carpetas vacías (/nba, /nfl, /nhl), listas para
// cuando se construyan, sin afectar en nada a lo que ya funciona en MLB.
const SPORTS = [
  { id: "mlb", name: "MLB", emoji: "⚾", ready: true, tagline: "Béisbol — datos reales en vivo" },
  { id: "nba", name: "NBA", emoji: "🏀", ready: false, tagline: "Básquetbol — próximamente" },
  { id: "nfl", name: "NFL", emoji: "🏈", ready: false, tagline: "Fútbol americano — próximamente" },
  { id: "nhl", name: "NHL", emoji: "🏒", ready: false, tagline: "Hockey — próximamente" },
];

function SportLanding({ onSelect }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#0B1F17" }}>
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black tracking-tight" style={{ color: "#EDEAE1", fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
            DIAMOND<span style={{ color: "#FFB627" }}>STATS</span>
          </h1>
          <p className="text-sm mt-2" style={{ color: "#8FA599" }}>Elige un deporte</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {SPORTS.map((sport) => (
            <button
              key={sport.id}
              onClick={() => sport.ready && onSelect(sport.id)}
              disabled={!sport.ready}
              className="p-6 rounded-2xl border text-left transition-transform"
              style={{
                background: "#12281E",
                borderColor: sport.ready ? "#FFB627" : "#1F3D30",
                opacity: sport.ready ? 1 : 0.5,
                cursor: sport.ready ? "pointer" : "not-allowed",
              }}
            >
              <div style={{ fontSize: "36px" }}>{sport.emoji}</div>
              <div className="text-lg font-bold mt-2" style={{ color: "#EDEAE1" }}>{sport.name}</div>
              <div className="text-xs mt-1" style={{ color: "#8FA599" }}>{sport.tagline}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [sport, setSport] = useState(null);

  if (sport === "mlb") return <DiamondStats onBackToMenu={() => setSport(null)} />;

  // nba/nfl/nhl no son seleccionables todavía (botón deshabilitado en
  // SportLanding), así que si algún día se activan sin tener su
  // componente listo, esto evita una pantalla en blanco.
  if (sport === "nba" || sport === "nfl" || sport === "nhl") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B1F17", color: "#8FA599" }}>
        Próximamente — vuelve pronto.
      </div>
    );
  }

  return <SportLanding onSelect={setSport} />;
}
