import { describe, expect, it } from "vitest";
import { GameNetCodec } from "../../../net/protocol/codec";
import { HostRuntime } from "../../../net/runtime/host";
import { createMemoryPeerPair } from "../../../net/transport/memory";
import { DRIVING_PROFILES } from "../driving-profiles";
import { NetworkDrivingSession } from "./network-session";
import {
  CONFIGURABLE_DRIVING_RULESET_ID,
  configurableDrivingPayloadCodec,
} from "./configurable-protocol";
import { PRODUCTION_DRIVING_GAME_ID } from "./protocol";
import { authoritativeDrivingSimulation } from "./simulation";

function createHost() {
  return new HostRuntime({
    simulation: authoritativeDrivingSimulation,
    simulationConfig: {
      world: {
        spawn: { x: 0, z: 0, heading: 0 },
        isOnPavement: () => true,
        queryCollision: () => null,
        isOutsideBoundary: () => false,
      },
      profile: DRIVING_PROFILES.loose,
      controlMode: "manual" as const,
      spawns: [{ x: 0, z: 0, heading: 0 }],
      mapId: "city-circuit",
      modeId: "cruise",
      profileId: "loose",
    },
    codec: new GameNetCodec(configurableDrivingPayloadCodec),
    gameId: PRODUCTION_DRIVING_GAME_ID,
    rulesetId: CONFIGURABLE_DRIVING_RULESET_ID,
    createPlayerId: () => "driver",
  });
}

describe("NetworkDrivingSession", () => {
  it("owns client negotiation, input, events, and interpolated snapshots", async () => {
    const host = createHost();
    const [hostPeer, clientPeer] = createMemoryPeerPair("client", "host");
    host.attach(hostPeer);
    const session = new NetworkDrivingSession({
      peer: clientPeer,
      interpolation: { interpolationDelaySeconds: 0, now: () => 0 },
    });
    const events: string[] = [];
    session.onEvent((event) => events.push(event.type));
    session.start();
    await flushMicrotasks();
    expect(session.state).toBe("connected");
    expect(session.playerId).toBe("driver");
    expect(events).toContain("joined");

    session.sendInput({ steering: 0, throttle: 1, brake: false, handbrake: false });
    await flushMicrotasks();
    for (let index = 0; index < 120; index++) host.advance(1 / 60);
    await flushMicrotasks(20);
    expect(session.sample(0)?.players[0].position[1]).toBeGreaterThan(10);

    host.close();
    await flushMicrotasks();
    expect(session.state).toBe("closed");
    expect(session.sample(0)).toBeNull();
  });
});

async function flushMicrotasks(count = 8) {
  for (let index = 0; index < count; index++) await Promise.resolve();
}
