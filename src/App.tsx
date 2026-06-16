import "./App.css";
import logo from "./Resources/HPRC-Logo-and-Text.svg";
import ArcGauge from "./Components/ArcGauge";
import ProgressBar from "./Components/ProgressBar";
import { RocketViewer } from "./Components/RocketViewer";
import { TrajectoryViewer } from "./Components/TrajectoryViewer";
import { MaxStats } from "./Components/MaxStats";

function App() {
  return (
    <main className="container">
      <div className="video-layer" aria-hidden="true" />
      <ProgressBar
        title="Altitude (AGL)"
        secondary="UNOFFICIAL"
        ticknames={['Launch Pad', '10 kft', '20 kft', '30 kft']}
        tickvalues={[0, 0.333, 0.667, 1.0]}
        thickness="8px"
      // color="white"
      ></ProgressBar>
      <TrajectoryViewer debug groundStation={{ x: -3000, y: 0, z: 1000 }}></TrajectoryViewer>

      {/* <LiveVideo></LiveVideo> */}

      <div className="container-secondary" id="gauges-container">
        <MaxStats data={{speed: 1000, altitude: 27800, gForce: 17}}></MaxStats>
        <RocketViewer quaternion={{ x: 0, y: 0, z: 0, w: 1 }}></RocketViewer>
        <div className="container-secondary" id="title-container">
          <div className="logo-container">
            <p id="title-primary">WPI</p>
            <img src={logo} id="logo-img"></img>
          </div>
        </div>
        <ArcGauge
          value={79}
          min={0}
          max={120}
          units="MPH"
          label="SPEED"
        />
        <ArcGauge
          value={5}
          min={0}
          max={18}
          units="&nbsp;"
          label="G-FORCE"
        />
      </div>
    </main>
  );
}

export default App;
