import { describe, expect, it, vi } from "vitest";
import { movingCirclesPayloadCodec } from "../../conformance/moving-circles/protocol";
import type {
  MovingCirclesEvent,
  MovingCirclesInput,
  MovingCirclesSnapshot,
} from "../../conformance/moving-circles/simulation";
import { GameNetCodec } from "../protocol/codec";
import { createMemoryPeerPair } from "../transport/memory";
import { ClientRuntime } from "./client";

const codec = new GameNetCodec(movingCirclesPayloadCodec);
const rulesetId = new Uint8Array(16).fill(5);

function createClient() {
  const [hostPeer, clientPeer] = createMemoryPeerPair("client", "host");
  const client = new ClientRuntime<MovingCirclesInput, MovingCirclesSnapshot, MovingCirclesEvent>({
    peer: clientPeer,
    codec,
    gameId: "moving-circles",
    rulesetId,
    features: [32],
  });
  return { hostPeer, client };
}

describe("ClientRuntime", () => {
  it("performs HELLO/WELCOME negotiation and sends sequenced input", async () => {
    const { hostPeer, client } = createClient();
    const receivedInputs: number[] = [];
    hostPeer.onReliable((bytes) => {
      const decoded = codec.decodeForChannel(bytes, "reliable");
      if (!decoded.ok || decoded.value.type !== "hello") return;
      hostPeer.sendReliable(codec.encode({
        type: "welcome",
        protocolMajor: 1,
        playerId: "player-7",
        gameId: decoded.value.gameId,
        rulesetId: decoded.value.rulesetId,
        features: [32],
      }));
    });
    hostPeer.onRealtime((bytes) => {
      const decoded = codec.decodeForChannel(bytes, "realtime");
      if (decoded.ok && decoded.value.type === "input") receivedInputs.push(decoded.value.sequence);
    });

    client.start();
    await flushMicrotasks();
    client.sendInput({ direction: [1, 0] });
    client.sendInput({ direction: [0, 1] });
    await flushMicrotasks();

    expect(client.state).toBe("connected");
    expect(client.playerId).toBe("player-7");
    expect(client.features).toEqual([32]);
    expect(receivedInputs).toEqual([0, 1]);
  });

  it("surfaces snapshots and events from the host", async () => {
    const { hostPeer, client } = createClient();
    completeNegotiation(hostPeer, client);
    const snapshots = vi.fn();
    const events = vi.fn();
    client.onSnapshot(snapshots);
    client.onEvent(events);
    await flushMicrotasks();

    hostPeer.sendRealtime(codec.encode({
      type: "snapshot",
      tick: 3,
      snapshot: { players: [{ playerId: "player-1", position: [2, 4] }] },
    }));
    hostPeer.sendReliable(codec.encode({
      type: "event",
      tick: 3,
      event: { type: "joined", playerId: "player-2" },
    }));
    await flushMicrotasks();

    expect(snapshots).toHaveBeenCalledWith({
      type: "snapshot",
      tick: 3,
      snapshot: { players: [{ playerId: "player-1", position: [2, 4] }] },
    });
    expect(events).toHaveBeenCalledWith({
      type: "event",
      tick: 3,
      event: { type: "joined", playerId: "player-2" },
    });
  });

  it("reports realtime PONG responses for RTT measurement", async () => {
    const { hostPeer, client } = createClient();
    completeNegotiation(hostPeer, client);
    const pong = vi.fn();
    client.onPong(pong);
    await flushMicrotasks();
    hostPeer.sendRealtime(codec.encode({ type: "pong", requestId: 17 }));
    await flushMicrotasks();
    expect(pong).toHaveBeenCalledWith(17);
  });

  it("fails closed when WELCOME changes compatibility identity", async () => {
    const { hostPeer, client } = createClient();
    const errors = vi.fn();
    client.onError(errors);
    hostPeer.onReliable((bytes) => {
      const decoded = codec.decodeForChannel(bytes, "reliable");
      if (!decoded.ok || decoded.value.type !== "hello") return;
      hostPeer.sendReliable(codec.encode({
        type: "welcome",
        protocolMajor: 1,
        playerId: "player-1",
        gameId: "different-game",
        rulesetId,
        features: [],
      }));
    });

    client.start();
    await flushMicrotasks();

    expect(client.state).toBe("closed");
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ kind: "protocol" }));
  });

  it("surfaces host loss once", async () => {
    const { hostPeer, client } = createClient();
    completeNegotiation(hostPeer, client);
    const closed = vi.fn();
    client.onClose(closed);
    await flushMicrotasks();

    hostPeer.close();
    hostPeer.close();

    expect(client.state).toBe("closed");
    expect(closed).toHaveBeenCalledOnce();
  });

  it("fails closed on malformed host traffic", async () => {
    const { hostPeer, client } = createClient();
    completeNegotiation(hostPeer, client);
    const errors = vi.fn();
    client.onError(errors);
    await flushMicrotasks();

    hostPeer.sendRealtime(new Uint8Array([0]));
    await flushMicrotasks();

    expect(client.state).toBe("closed");
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ kind: "decode" }));
  });
});

function completeNegotiation(
  hostPeer: ReturnType<typeof createMemoryPeerPair>[0],
  client: ClientRuntime<MovingCirclesInput, MovingCirclesSnapshot, MovingCirclesEvent>,
) {
  hostPeer.onReliable((bytes) => {
    const decoded = codec.decodeForChannel(bytes, "reliable");
    if (!decoded.ok || decoded.value.type !== "hello") return;
    hostPeer.sendReliable(codec.encode({
      type: "welcome",
      protocolMajor: 1,
      playerId: "player-1",
      gameId: "moving-circles",
      rulesetId,
      features: [],
    }));
  });
  client.start();
}

async function flushMicrotasks(count = 8) {
  for (let index = 0; index < count; index++) await Promise.resolve();
}
