import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { RocketTelemetryPacket } from "./gen/RocketTelemetryPacket";

import Graph from "./graphics/Graph";

import "./App.css";

function App() {
  const [serverResponse, setServerResponse] = useState("");
  const [simRunning, setSimRunning] = useState(false);
  const [data, setData] = useState([]);

  async function start_data_sim() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setServerResponse(await invoke("start_data_sim", {path: "../public/SimulationData/IREC2025.csv", serverResponse}));
    setSimRunning(true);
  }
  
  async function stop_data_sim() {
      // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
      setServerResponse(await invoke("stop_data_sim", { serverResponse }));
      setSimRunning(false);
    }

    const MAX_DATA_SIZE = 1000;


  useEffect(() => {
    let unsubs: UnlistenFn[] = [];

    (async () => {
      // Register exactly once
      unsubs.push(
        await listen("sim_data", (e) => {
          const pkt = RocketTelemetryPacket.fromJSON(e.payload as any);

          // Extract & guard values
          const x = Number(pkt.loopCount ?? 0);
          const y = Number(pkt.altitude ?? 0);

          if (!Number.isFinite(x) || !Number.isFinite(y)) return; // skip bad rows

          setData((curr) => {
            const next = [...curr, { x, y }];
            if (next.length > MAX_DATA_SIZE) next.shift();
            return next;
          });

          setServerResponse(String(y));
          setSimRunning(true);
        })
      );
    })();

    return () => {
      unsubs.forEach((u) => u());
      unsubs = [];
    };
  }, []);

  return (
    <main className="container">
      <h1>HPRC Ground Station</h1>

      <Graph data={data} xlabel="x" ylabel="y" title="y vs. x" />

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if(simRunning) {
            stop_data_sim();
          }
          else {
            start_data_sim();
          }
        }}
      >
        <button type="submit">{simRunning ? "Stop Data Simulation" : "Start Data Simulation"}</button>
      </form>
      <p>{serverResponse}</p>
    </main>
  );
}

export default App;
