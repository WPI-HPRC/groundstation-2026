export interface BufferedFrame {
  timestamp: number;
  image: ImageData;
}

/** Fixed-capacity FIFO jitter buffer. Holds until full, then emits oldest-first.
 * Once the buffer has filled to capacity and begun emitting, it continues to
 * drain (never re-enters the hold state) so playback doesn't stall. */
export class FrameBuffer {
  private readonly queue: BufferedFrame[] = [];
  private lastPushedTs: number | null = null;
  private draining = false;

  constructor(private readonly capacity: number) {}

  get size(): number {
    return this.queue.length;
  }

  push(f: BufferedFrame): void {
    if (this.lastPushedTs === f.timestamp) return;
    this.lastPushedTs = f.timestamp;
    this.queue.push(f);
    while (this.queue.length > this.capacity) this.queue.shift();
  }

  /** Returns the next frame to display, or null to hold the previous one. */
  next(): BufferedFrame | null {
    if (!this.draining && this.queue.length < this.capacity) return null;
    this.draining = true;
    if (this.queue.length === 0) {
      this.draining = false; // reset when buffer fully drained
      return null;
    }
    return this.queue.shift() ?? null;
  }
}
