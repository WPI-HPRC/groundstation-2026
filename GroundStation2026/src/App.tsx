import { useState, useEffect } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";

import Graph from "./graphics/Graph";

import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  const MAX_DATA_SIZE = 100;

  const [data, setData] = useState([]);
  let counter = 0;

  useEffect(() => {
    const interval = setInterval(() => {
      // Logic to fetch or generate new data
      const newDataPoint = {
        x: counter,
        y: Math.random() * 100,
      };
      counter++;
      
      // Update the state with the new rolling data
      setData(currentData => {
        // Create a new array to avoid direct state mutation
        const nextData = [...currentData, newDataPoint];
        // If the array exceeds the max size, remove the oldest element
        if (nextData.length > MAX_DATA_SIZE) {
          nextData.shift();
        }
        return nextData;
      });
    }, 10); // Update every second

    return () => clearInterval(interval); // Cleanup function
  }, []);

  return (
    <main className="container">
      <h1>HPRC Ground Station</h1>

      <Graph data={data} xlabel="x" ylabel="y" title="y vs. x" />

      <div className="row">
        <a href="https://vitejs.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://reactjs.org" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>
      <p>{greetMsg}</p>
    </main>
  );
}

export default App;
