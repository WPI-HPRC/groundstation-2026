/** Fixed-capacity FIFO buffer; O(1) push, returns a copy on toArray(). */
export class RingBuffer<T> {
  private readonly buf: (T | undefined)[];
  private head = 0; // index of the oldest element
  private len = 0;

  constructor(private readonly capacity: number) {
    if (capacity <= 0) throw new Error("capacity must be > 0");
    this.buf = new Array<T | undefined>(capacity);
  }

  push(item: T): void {
    const idx = (this.head + this.len) % this.capacity;
    this.buf[idx] = item;
    if (this.len < this.capacity) {
      this.len++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  toArray(): T[] {
    const out: T[] = new Array(this.len);
    for (let i = 0; i < this.len; i++) {
      out[i] = this.buf[(this.head + i) % this.capacity] as T;
    }
    return out;
  }

  latest(): T | undefined {
    if (this.len === 0) return undefined;
    return this.buf[(this.head + this.len - 1) % this.capacity];
  }

  get size(): number {
    return this.len;
  }

  clear(): void {
    this.head = 0;
    this.len = 0;
    this.buf.fill(undefined);
  }
}
