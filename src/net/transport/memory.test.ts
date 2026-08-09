import { describe, expect, it, vi } from "vitest";
import { createMemoryPeerPair } from "./memory";

describe("in-memory PeerConnection", () => {
  it("delivers reliable and realtime bytes on separate paths", async () => {
    const [left, right] = createMemoryPeerPair("right", "left");
    const reliable = vi.fn();
    const realtime = vi.fn();
    right.onReliable(reliable);
    right.onRealtime(realtime);

    left.sendReliable(new Uint8Array([1, 2, 3]));
    left.sendRealtime(new Uint8Array([4, 5]));
    await Promise.resolve();

    expect(left.peerId).toBe("right");
    expect(right.peerId).toBe("left");
    expect(reliable).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(realtime).toHaveBeenCalledWith(new Uint8Array([4, 5]));
  });

  it("copies outgoing bytes before asynchronous delivery", async () => {
    const [left, right] = createMemoryPeerPair();
    const received: Uint8Array[] = [];
    right.onReliable((bytes) => received.push(bytes));
    const outgoing = new Uint8Array([10, 20]);

    left.sendReliable(outgoing);
    outgoing[0] = 99;
    await Promise.resolve();

    expect(received[0]).toEqual(new Uint8Array([10, 20]));
    expect(received[0]).not.toBe(outgoing);
  });

  it("propagates closure to both ends exactly once", () => {
    const [left, right] = createMemoryPeerPair();
    const leftClosed = vi.fn();
    const rightClosed = vi.fn();
    left.onClose(leftClosed);
    right.onClose(rightClosed);

    left.close();
    left.close();
    right.close();

    expect(leftClosed).toHaveBeenCalledTimes(1);
    expect(rightClosed).toHaveBeenCalledTimes(1);
  });

  it("immediately informs close handlers registered after closure", () => {
    const [left] = createMemoryPeerPair();
    const closed = vi.fn();

    left.close();
    left.onClose(closed);

    expect(closed).toHaveBeenCalledOnce();
  });

  it("rejects sends after either end closes", () => {
    const [left, right] = createMemoryPeerPair();
    right.close();

    expect(() => left.sendReliable(new Uint8Array())).toThrow("closed");
    expect(() => right.sendRealtime(new Uint8Array())).toThrow("closed");
  });
});
