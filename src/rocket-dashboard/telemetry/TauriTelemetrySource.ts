import { invoke } from "@tauri-apps/api/core";
import type { FrameCallback, TelemetrySourceWithDiagnostics } from "./TelemetrySource";
import { FLIGHT_STATE_ORDER, FlightState, type Quat, type TelemetryFrame, type Vec3 } from "./types";
import { pressureToAltitude } from "./baro";

type LatestDto = { timestamp: number; value: string };

const MIN_POLL_MS = 10;

function parseNum(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function stateFromU32(raw: number | null): FlightState | null {
  if (raw == null) return null;
  const idx = Math.trunc(raw);
  return FLIGHT_STATE_ORDER[idx] ?? null;
}

const STORE = "rocket";
const FIELDS = {
  state: "state",
  voltage: "battery_voltage",
  temperature: "temp",
  pressure: "pressure",
  gyro: ["asm330_gyr0", "asm330_gyr1", "asm330_gyr2"] as const,
  accel: ["asm330_accel0", "asm330_accel1", "asm330_accel2"] as const,
  mag: ["mag0", "mag1", "mag2"] as const,
  // EKF
  q: ["w", "i", "j", "k"] as const,
  vel: ["vel_x", "vel_y", "vel_z"] as const,
  pos: ["pos_x", "pos_y", "pos_z"] as const,
} as const;

async function latest(field_name: string): Promise<LatestDto | null> {
  try {
    const out = await invoke<LatestDto | null>("get_latest_telemetry", {
      storeName: STORE,
      fieldName: field_name,
    });
    return out ?? null;
  } catch {
    return null;
  }
}

export class TauriTelemetrySource implements TelemetrySourceWithDiagnostics {
  private readonly updateMs: number;
  private timer: number | null = null;
  private readonly subs = new Set<FrameCallback>();
  private lastFrame: TelemetryFrame | null = null;
  private droppedFrames = 0;

  constructor({ updateHz = 20 }: { updateHz?: number } = {}) {
    this.updateMs = Math.max(MIN_POLL_MS, Math.round(1000 / updateHz));
  }

  subscribe(cb: FrameCallback): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  start(): void {
    if (this.timer != null) return;
    this.timer = window.setInterval(() => void this.pollOnce(), this.updateMs);
    void this.pollOnce();
  }

  stop(): void {
    if (this.timer == null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  private emit(frame: TelemetryFrame) {
    for (const cb of this.subs) cb(frame);
  }

  diagnostics() {
    return { droppedFrames: this.droppedFrames };
  }

  private async pollOnce(): Promise<void> {
    // Fetch all required fields in parallel.
    const [
      st,
      vbat,
      temp,
      alt,
      gx,
      gy,
      gz,
      ax,
      ay,
      az,
      mx,
      my,
      mz,
      qw,
      qi,
      qj,
      qk,
      vx,
      vy,
      vz,
      px,
      py,
      pz,
    ] = await Promise.all([
      latest(FIELDS.state),
      latest(FIELDS.voltage),
      latest(FIELDS.temperature),
      latest(FIELDS.pressure),
      latest(FIELDS.gyro[0]),
      latest(FIELDS.gyro[1]),
      latest(FIELDS.gyro[2]),
      latest(FIELDS.accel[0]),
      latest(FIELDS.accel[1]),
      latest(FIELDS.accel[2]),
      latest(FIELDS.mag[0]),
      latest(FIELDS.mag[1]),
      latest(FIELDS.mag[2]),
      latest(FIELDS.q[0]),
      latest(FIELDS.q[1]),
      latest(FIELDS.q[2]),
      latest(FIELDS.q[3]),
      latest(FIELDS.vel[0]),
      latest(FIELDS.vel[1]),
      latest(FIELDS.vel[2]),
      latest(FIELDS.pos[0]),
      latest(FIELDS.pos[1]),
      latest(FIELDS.pos[2]),
    ]);

    // Only emit frames when we have at least one valid datapoint to report.
    const ts =
      st?.timestamp ??
      qw?.timestamp ??
      vbat?.timestamp ??
      temp?.timestamp ??
      alt?.timestamp ??
      vx?.timestamp ??
      px?.timestamp ??
      this.lastFrame?.timestamp ??
      null;

    const gxN = parseNum(gx?.value);
    const gyN = parseNum(gy?.value);
    const gzN = parseNum(gz?.value);
    const axN = parseNum(ax?.value);
    const ayN = parseNum(ay?.value);
    const azN = parseNum(az?.value);
    const mxN = parseNum(mx?.value);
    const myN = parseNum(my?.value);
    const mzN = parseNum(mz?.value);

    const qwN = parseNum(qw?.value);
    const qiN = parseNum(qi?.value);
    const qjN = parseNum(qj?.value);
    const qkN = parseNum(qk?.value);

    const vxN = parseNum(vx?.value);
    const vyN = parseNum(vy?.value);
    const vzN = parseNum(vz?.value);

    const pxN = parseNum(px?.value);
    const pyN = parseNum(py?.value);
    const pzN = parseNum(pz?.value);

    const vbatN = parseNum(vbat?.value);
    const tempN = parseNum(temp?.value);
    const pressureN = parseNum(alt?.value);
    const altN = pressureN != null ? pressureToAltitude(pressureN) : null;
    const stateN = stateFromU32(parseNum(st?.value));

    const anyValid =
      ts != null ||
      gxN != null ||
      gyN != null ||
      gzN != null ||
      axN != null ||
      ayN != null ||
      azN != null ||
      mxN != null ||
      myN != null ||
      mzN != null ||
      qwN != null ||
      qiN != null ||
      qjN != null ||
      qkN != null ||
      vxN != null ||
      vyN != null ||
      vzN != null ||
      pxN != null ||
      pyN != null ||
      pzN != null ||
      vbatN != null ||
      tempN != null ||
      altN != null ||
      stateN != null;

    if (!anyValid) {
      this.droppedFrames++;
      return;
    }

    // If we don't yet have a last frame, require all essential fields to be present
    // so we never emit fabricated zeros.
    if (!this.lastFrame) {
      const haveVec3 =
        gxN != null &&
        gyN != null &&
        gzN != null &&
        axN != null &&
        ayN != null &&
        azN != null &&
        mxN != null &&
        myN != null &&
        mzN != null &&
        vxN != null &&
        vyN != null &&
        vzN != null &&
        pxN != null &&
        pyN != null &&
        pzN != null;
      const haveQuat = qwN != null && qiN != null && qjN != null && qkN != null;
      const haveScalars = vbatN != null && tempN != null && altN != null && stateN != null;
      if (!(ts != null && haveVec3 && haveQuat && haveScalars)) {
        this.droppedFrames++;
        return;
      }
    }

    const gyro: Vec3 = {
      x: gxN ?? this.lastFrame!.gyro.x,
      y: gyN ?? this.lastFrame!.gyro.y,
      z: gzN ?? this.lastFrame!.gyro.z,
    };
    const accel: Vec3 = {
      x: axN ?? this.lastFrame!.accel.x,
      y: ayN ?? this.lastFrame!.accel.y,
      z: azN ?? this.lastFrame!.accel.z,
    };
    const mag: Vec3 = {
      x: mxN ?? this.lastFrame!.mag.x,
      y: myN ?? this.lastFrame!.mag.y,
      z: mzN ?? this.lastFrame!.mag.z,
    };

    const orientation: Quat = {
      w: qwN ?? this.lastFrame!.orientation.w,
      i: qiN ?? this.lastFrame!.orientation.i,
      j: qjN ?? this.lastFrame!.orientation.j,
      k: qkN ?? this.lastFrame!.orientation.k,
    };

    const velX = vxN ?? 0;
    const velY = vyN ?? 0;
    const velZ = vzN ?? 0;
    const velocity =
      vxN != null && vyN != null && vzN != null ? Math.hypot(velX, velY, velZ) : this.lastFrame!.velocity;

    const positionLocal: Vec3 = {
      x: pxN ?? this.lastFrame!.positionLocal.x,
      y: pyN ?? this.lastFrame!.positionLocal.y,
      z: pzN ?? this.lastFrame!.positionLocal.z,
    };

    const acceleration = Math.hypot(accel.x, accel.y, accel.z);

    const frame: TelemetryFrame = {
      timestamp: ts ?? this.lastFrame!.timestamp,
      state: stateN ?? this.lastFrame!.state,
      orientation,
      velocity,
      acceleration,
      voltage: vbatN ?? this.lastFrame!.voltage,
      gyro,
      accel,
      mag,
      altitude: altN ?? this.lastFrame!.altitude,
      temperature: tempN ?? this.lastFrame!.temperature,
      positionLocal,
    };

    this.lastFrame = frame;
    this.emit(frame);
  }
}

