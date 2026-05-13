import "./App.css";
import logo from "./Resources/HPRC-Logo-and-Text.svg";
import testImg from "./Resources/bg-img-test.png";
import ArcGauge from "./Components/ArcGauge";
import ProgressBar from "./Components/ProgressBar";

function App() {
  return (
    <main className="container">
      <div></div>
      <div className="container-secondary" id="title-container">
        <p id="title-primary">WPI HPRC</p>
        <p id="title-secondary">Worcester Polytechnic Institute High Power Rocketry Club</p>
        {/* <p id="title-tertiary">Team 208</p> */}
      </div>
      <div className="container-secondary"></div>
      <ProgressBar title="Altitude"
        ticknames={['0 ft', '5k ft', '10k ft', '15k ft', '20k ft', '25 ft']}
        tickvalues={[0, 0.2, 0.4, 0.6, 0.8, 1.0]}
      ></ProgressBar>
      <div className="container-secondary" id="img-container">
        <img className="img-fill" src={testImg}></img>
      </div>
      <ProgressBar title="Phase"
        ticknames={['Boost', 'Coast', 'Apogee']}
        tickvalues={[0, 0.2, 1]}
      ></ProgressBar>
      <div className="container-secondary" id="logo-container">
              <img src={logo} id="logo-img"></img>
      </div>
      <div className="container-secondary" id="gauges-container">
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
      <div className="container-secondary"></div>
    </main>
  );
}

export default App;
