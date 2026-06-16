import "./App.css";
import logo from "./Resources/HPRC-Logo-and-Text.svg";
import ArcGauge from "./Components/ArcGauge";
import ProgressBar from "./Components/ProgressBar";
import LiveVideo from "./Components/LiveVideo";
import { RocketViewer } from "./Components/RocketViewer";
import { LiveTrajectoryDebug } from "./Components/LiveTrajectoryDebug";

function App() {
  return (
    <main className="container">
      <div></div>
      <div></div>
      <div></div>

      <ProgressBar
        title="Altitude (AGL)"
        secondary="UNOFFICIAL"
        ticknames={['Launch Pad', '10 kft', '20 kft', '30 kft']}
        tickvalues={[0, 0.333, 0.667, 1.0]}
        thickness="8px"
      // color="white"
      ></ProgressBar>
      <div></div>
      <LiveTrajectoryDebug></LiveTrajectoryDebug>

      {/* <LiveVideo></LiveVideo> */}

      <div className="container-secondary" id="gauges-container">
        <RocketViewer quaternion={{ x: 0, y: 0, z: 0, w: 1 }}></RocketViewer>
        <div className="container-secondary" id="title-container">
          <div className="logo-container">
            <p id="title-primary">WPI</p>
            <img src={logo} id="logo-img"></img>
          </div>
          {/* <p id="title-secondary">Worcester Polytechnic Institute High Power Rocketry Club</p> */}
          {/* <p id="title-tertiary">Team 208</p> */}
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
