import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    // Se queda registrado en la consola del navegador para poder
    // diagnosticar qué pasó, en vez de desaparecer en silencio.
    console.error("DiamondStats crash:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: "#0B1F17", color: "#EDEAE1", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Algo salió mal</h1>
            <p style={{ fontSize: 13, color: "#8FA599", marginBottom: 16 }}>
              La app tuvo un error inesperado. Presiona el botón para recargarla — tus datos no se pierden.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ background: "#FFB627", color: "#0B1F17", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Registra el service worker (necesario para que Android permita instalar
// la app de verdad, no solo un acceso directo).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
