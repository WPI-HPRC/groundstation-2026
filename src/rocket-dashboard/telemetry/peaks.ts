/** Tracks a session maximum; ignores NaN/Infinity. */
export class PeakTracker {
  private _max = 0;
  update(v: number): void {
    if (Number.isFinite(v) && v > this._max) this._max = v;
  }
  get max(): number {
    return this._max;
  }
  reset(): void {
    this._max = 0;
  }
}
