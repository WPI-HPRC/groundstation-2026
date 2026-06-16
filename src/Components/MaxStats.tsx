import { useEffect, useState } from "react";
import "./MaxStats.css";

type LiveFlightData = {
  speed: number;
  altitude: number;
  gForce: number;
};

type MaxStatsProps = {
  data?: LiveFlightData;
  speedUnits?: string;
  altitudeUnits?: string;
  resetKey?: number | string;
};

export function MaxStats({
  data,
  speedUnits = "mph",
  altitudeUnits = "ft",
  resetKey,
}: MaxStatsProps) {
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [maxAltitude, setMaxAltitude] = useState(0);
  const [maxGForce, setMaxGForce] = useState(0);

  useEffect(() => {
    setMaxSpeed(0);
    setMaxAltitude(0);
    setMaxGForce(0);
  }, [resetKey]);

  useEffect(() => {
    if (!data) return;

    if (Number.isFinite(data.speed)) {
      setMaxSpeed((prev) => Math.max(prev, data.speed));
    }

    if (Number.isFinite(data.altitude)) {
      setMaxAltitude((prev) => Math.max(prev, data.altitude));
    }

    if (Number.isFinite(data.gForce)) {
      setMaxGForce((prev) => Math.max(prev, data.gForce));
    }
  }, [data]);

  return (
    <div className="max-stats-card">
      {/* <div className="max-stats-title">MAX STATS</div> */}


      <div className="max-stats-row">
        <span className="max-stats-label">Apogee</span>
        <span className="max-stats-value">
          {maxAltitude.toFixed(0)}
          <span className="max-stats-units">{altitudeUnits}</span>
        </span>
      </div>

      <div className="max-stats-row">
        <span className="max-stats-label">Max Speed</span>
        <span className="max-stats-value">
          {maxSpeed.toFixed(0)}
          <span className="max-stats-units">{speedUnits}</span>
        </span>
      </div>

      <div className="max-stats-row">
        <span className="max-stats-label">Max G</span>
        <span className="max-stats-value">
          {maxGForce.toFixed(2)}
          <span className="max-stats-units">G</span>
        </span>
      </div>
    </div>
  );
}