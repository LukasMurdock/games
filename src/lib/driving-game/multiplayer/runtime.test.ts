import { describe, expect, it } from "vitest";
import { GameNetCodec } from "../../../net/protocol/codec";
import { ClientRuntime } from "../../../net/runtime/client";
import { HostRuntime } from "../../../net/runtime/host";
import { createMemoryPeerPair } from "../../../net/transport/memory";
import { DRIVING_PROFILES } from "../driving-profiles";
import {
  PRODUCTION_DRIVING_GAME_ID,
  PRODUCTION_DRIVING_RULESET_ID,
  productionDrivingPayloadCodec,
} from "./protocol";
import {
  authoritativeDrivingSimulation,
  type AuthoritativeDrivingEvent,
  type AuthoritativeDrivingInput,
  type AuthoritativeDrivingSnapshot,
} from "./simulation";

const codec = new GameNetCodec(productionDrivingPayloadCodec);

describe("production driving through GameNet runtimes", () => {
  it("negotiates, applies remote intent on host ticks, and publishes production state", async () => {
    const host = new HostRuntime({
      simulation: authoritativeDrivingSimulation,
      simulationConfig: {
        world: {
          spawn: { x: 0, z: 0, heading: 0 },
          isOnPavement: () => true,
          queryCollision: () => null,
          isOutsideBoundary: () => false,
        },
        profile: DRIVING_PROFILES.balanced,
        controlMode: "manual",
        spawns: [{ x: 0, z: 0, heading: 0 }],
      },
      codec,
      gameId: PRODUCTION_DRIVING_GAME_ID,
      rulesetId: PRODUCTION_DRIVING_RULESET_ID,
      createPlayerId: () => "driver-1",
    });
    const [hostPeer, clientPeer] = createMemoryPeerPair("browser", "host");
    host.attach(hostPeer);
    const client = new ClientRuntime<
      AuthoritativeDrivingInput,
      AuthoritativeDrivingSnapshot,
      AuthoritativeDrivingEvent
    >({
      peer: clientPeer,
      codec,
      gameId: PRODUCTION_DRIVING_GAME_ID,
      rulesetId: PRODUCTION_DRIVING_RULESET_ID,
    });
    const snapshots: AuthoritativeDrivingSnapshot[] = [];
    client.onSnapshot((message) => snapshots.push(message.snapshot));
    client.start();
    await flushMicrotasks();

    expect(client.state).toBe("connected");
    expect(client.playerId).toBe("driver-1");
    const initial = host.getSnapshot().players[0].position;
    client.sendInput({ steering: 0, throttle: 1, brake: false, handbrake: false });
    expect(host.getSnapshot().players[0].position).toEqual(initial);
    await flushMicrotasks();
    for (let index = 0; index < 120; index++) host.advance(1 / 60);
    await flushMicrotasks(20);

    const authoritative = host.getSnapshot().players[0];
    expect(authoritative.position[1]).toBeGreaterThan(10);
    expect(authoritative.speed).toBeGreaterThan(10);
    expect(snapshots.at(-1)?.players[0]).toEqual(authoritative);
  });
});

async function flushMicrotasks(count = 8) {
  for (let index = 0; index < count; index++) await Promise.resolve();
}
