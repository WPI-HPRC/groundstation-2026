import "./App.css";
import logo from "./Resources/HPRC-Logo-and-Text.svg";
import ArcGauge from "./Components/ArcGauge";
import ProgressBar from "./Components/ProgressBar";
import LiveVideo from "./Components/LiveVideo";
import { RocketViewer } from "./Components/RocketViewer";

function App() {
  return (
    <main className="container">
      <div className="container-secondary">
      </div>
      <div className="container-secondary" id="title-container">
        <div className="logo-container">
          <p id="title-primary">WPI</p>
          <img src={logo} id="logo-img"></img>
        </div>
        <p id="title-secondary">Worcester Polytechnic Institute High Power Rocketry Club</p>
        {/* <p id="title-tertiary">Team 208</p> */}
      </div>
      <div className="container-secondary"></div>
      <ProgressBar title="Altitude"
        ticknames={['0 ft', '5k ft', '10k ft', '15k ft', '20k ft', '25 ft']}
        tickvalues={[0, 0.2, 0.4, 0.6, 0.8, 1.0]}
      ></ProgressBar>
      {/* <LiveVideo></LiveVideo> */}
      <div className="container-secondary"></div>
      <ProgressBar title="Phase"
        ticknames={['Boost', 'Coast', 'Apogee']}
        tickvalues={[0, 0.2, 1]}
      ></ProgressBar>
      <div className="container-secondary"></div>
      <div className="container-secondary" id="gauges-container">
        <ArcGauge
          value={79}
          min={0}
          max={120}
          units="MPH"
          label="SPEED"
        />
        <RocketViewer   quaternion={{ x: 0, y: 0, z: 0, w: 1 }}></RocketViewer>
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
