import { describe, expect, it, vi } from "vitest";
import { movingCirclesPayloadCodec } from "../../conformance/moving-circles/protocol";
import {
  movingCirclesSimulation,
  type MovingCirclesEvent,
  type MovingCirclesInput,
  type MovingCirclesSnapshot,
} from "../../conformance/moving-circles/simulation";
import { GameNetCodec } from "../protocol/codec";
import { createMemoryPeerPair } from "../transport/memory";
import type { PeerConnection } from "../transport/peer";
import { ClientRuntime, type ClientRuntimeError } from "./client";
import { HostRuntime } from "./host";

const rulesetId = new Uint8Array(16).fill(4);
const codec = new GameNetCodec(movingCirclesPayloadCodec);

type TestClient = {
  runtime: ClientRuntime<MovingCirclesInput, MovingCirclesSnapshot, MovingCirclesEvent>;
  peer: PeerConnection;
  snapshots: MovingCirclesSnapshot[];
  events: MovingCirclesEvent[];
  errors: ClientRuntimeError[];
};

function createHarness(now = () => 0) {
  let nextPlayer = 1;
  const host = new HostRuntime({
    simulation: movingCirclesSimulation,
    simulationConfig: { speed: 10 },
    codec,
    gameId: "moving-circles",
    rulesetId,
    features: [32],
    createPlayerId: () => `player-${nextPlayer++}`,
    now,
  });

  function connect(name: string): TestClient {
    const [hostPeer, clientPeer] = createMemoryPeerPair(name, "host");
    host.attach(hostPeer);
    const runtime = new ClientRuntime({
      peer: clientPeer,
      codec,
      gameId: "moving-circles",
      rulesetId,
      features: [32, 33],
    });
    const snapshots: MovingCirclesSnapshot[] = [];
    const events: MovingCirclesEvent[] = [];
    const errors: ClientRuntimeError[] = [];
    runtime.onSnapshot((message) => snapshots.push(message.snapshot));
    runtime.onEvent((message) => events.push(message.event));
    runtime.onError((error) => errors.push(error));
    runtime.start();
    return { runtime, peer: clientPeer, snapshots, events, errors };
  }

  return { host, connect };
}

describe("HostRuntime", () => {
  it("negotiates two clients and assigns connection-owned identities", async () => {
    const { host, connect } = createHarness();
    const first = connect("browser-a");
    const second = connect("browser-b");
    await flushMicrotasks();

    expect(first.runtime.state).toBe("connected");
    expect(second.runtime.state).toBe("connected");
    expect(first.runtime.playerId).toBe("player-1");
    expect(second.runtime.playerId).toBe("player-2");
    expect(first.runtime.features).toEqual([32]);
    expect(host.playerCount).toBe(2);
    expect(host.getSnapshot().players.map((player) => player.playerId)).toEqual([
      "player-1",
      "player-2",
    ]);
  });

  it("allows synchronous authority-only application transitions", () => {
    const { host } = createHarness();
    const playerCount = host.control((state) => state.players.size);
    expect(playerCount).toBe(0);
  });

  it("applies client intent only through fixed host ticks and publishes snapshots", async () => {
    const { host, connect } = createHarness();
    const client = connect("browser-a");
    await flushMicrotasks();
    const before = host.getSnapshot().players[0].position[0];

    expect(client.runtime.sendInput({ direction: [1, 0] })).toBe(0);
    expect(host.getSnapshot().players[0].position[0]).toBe(before);
    await flushMicrotasks();
    host.advance(0.05);
    await flushMicrotasks();

    expect(host.tick).toBe(3);
    expect(host.getSnapshot().players[0].position[0]).toBeCloseTo(before + 0.5);
    expect(client.snapshots.at(-1)?.players[0].position[0]).toBeCloseTo(before + 0.5);
  });

  it("ignores duplicate and stale input sequences", async () => {
    const { host, connect } = createHarness();
    const client = connect("browser-a");
    await flushMicrotasks();

    client.peer.sendRealtime(codec.encode({
      type: "input",
      sequence: 10,
      input: { direction: [1, 0] },
    }));
    client.peer.sendRealtime(codec.encode({
      type: "input",
      sequence: 9,
      input: { direction: [-1, 0] },
    }));
    client.peer.sendRealtime(codec.encode({
      type: "input",
      sequence: 10,
      input: { direction: [-1, 0] },
    }));
    await flushMicrotasks();
    host.advance(0.1);

    expect(host.getSnapshot().players[0].position[0]).toBeCloseTo(1);
  });

  it("disconnects only the departing player", async () => {
    const { host, connect } = createHarness();
    const first = connect("browser-a");
    const second = connect("browser-b");
    await flushMicrotasks();
    second.events.length = 0;

    first.runtime.close();
    await flushMicrotasks();

    expect(first.runtime.state).toBe("closed");
    expect(second.runtime.state).toBe("connected");
    expect(host.playerCount).toBe(1);
    expect(host.getSnapshot().players.map((player) => player.playerId)).toEqual(["player-2"]);
    expect(second.events).toContainEqual({ type: "left", playerId: "player-1" });
  });

  it("closes only a peer that reaches three protocol strikes", async () => {
    const { host, connect } = createHarness();
    const offender = connect("browser-a");
    const healthy = connect("browser-b");
    const offenderClosed = vi.fn();
    offender.runtime.onClose(offenderClosed);
    await flushMicrotasks();

    offender.peer.sendReliable(new Uint8Array([0]));
    offender.peer.sendReliable(new Uint8Array([0]));
    offender.peer.sendReliable(new Uint8Array([0]));
    await flushMicrotasks(12);

    expect(offender.runtime.state).toBe("closed");
    expect(offenderClosed).toHaveBeenCalledOnce();
    expect(offender.errors.at(-1)?.protocolError?.code).toBe(3);
    expect(healthy.runtime.state).toBe("connected");
    expect(host.playerCount).toBe(1);
  });

  it("counts wrong-direction and wrong-channel messages as strikes", async () => {
    const { connect } = createHarness();
    const offender = connect("browser-a");
    await flushMicrotasks();
    const snapshot = codec.encode({ type: "snapshot", tick: 1, snapshot: { players: [] } });
    const input = codec.encode({ type: "input", sequence: 1, input: { direction: [1, 0] } });

    offender.peer.sendRealtime(snapshot);
    offender.peer.sendReliable(input);
    offender.peer.sendReliable(input);
    await flushMicrotasks(12);

    expect(offender.runtime.state).toBe("closed");
    expect(offender.errors.at(-1)?.protocolError).toEqual(expect.objectContaining({ code: 7 }));
  });

  it("expires old strikes outside the ten-second window", async () => {
    let now = 0;
    const { connect } = createHarness(() => now);
    const client = connect("browser-a");
    await flushMicrotasks();

    client.peer.sendReliable(new Uint8Array([0]));
    client.peer.sendReliable(new Uint8Array([0]));
    await flushMicrotasks();
    now = 10_001;
    client.peer.sendReliable(new Uint8Array([0]));
    await flushMicrotasks();

    expect(client.runtime.state).toBe("connected");
  });
});

async function flushMicrotasks(count = 8) {
  for (let index = 0; index < count; index++) await Promise.resolve();
}
