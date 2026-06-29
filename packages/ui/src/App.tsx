import { useEffect, useState } from "react";

interface Project {
  name: string;
  root: string;
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3001";

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");

  useEffect(() => {
    // Fetch projects
    fetch(`${SERVER_URL}/api/projects`)
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => setProjects([]));

    // WebSocket connection
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setWsStatus("connected");
    ws.onclose = () => setWsStatus("disconnected");
    ws.onerror = () => setWsStatus("disconnected");

    return () => ws.close();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "-apple-system, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>spec-graph</h1>
        <span style={{
          padding: "4px 12px",
          borderRadius: 12,
          fontSize: 12,
          backgroundColor: wsStatus === "connected" ? "#238636" : wsStatus === "connecting" ? "#d29922" : "#f85149",
          color: "#fff",
        }}>
          WS: {wsStatus}
        </span>
      </header>

      <div style={{
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 8,
        padding: 16,
      }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#58a6ff" }}>Projects</h2>
        {projects.length === 0 ? (
          <p style={{ color: "#8b949e" }}>No projects found. Start the server with SPEC_GRAPH_WORKSPACE set.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {projects.map((p) => (
              <li key={p.name} style={{
                padding: "8px 12px",
                borderBottom: "1px solid #21262d",
                display: "flex",
                justifyContent: "space-between",
              }}>
                <span>{p.name}</span>
                <span style={{ color: "#8b949e", fontSize: 12 }}>{p.root}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default App;
