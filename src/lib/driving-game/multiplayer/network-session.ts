import { GameNetCodec } from "../../../net/protocol/codec";
import { ClientRuntime, type ClientRuntimeError, type ClientRuntimeState } from "../../../net/runtime/client";
import type { PeerConnection } from "../../../net/transport/peer";
import { DrivingSnapshotBuffer, type DrivingInterpolationOptions } from "./interpolation";
import {
  CONFIGURABLE_DRIVING_RULESET_ID,
  configurableDrivingPayloadCodec,
} from "./configurable-protocol";
import { PRODUCTION_DRIVING_GAME_ID } from "./protocol";
import type {
  AuthoritativeDrivingEvent,
  AuthoritativeDrivingInput,
  AuthoritativeDrivingSnapshot,
} from "./simulation";

export type NetworkDrivingSessionOptions = {
  peer: PeerConnection;
  interpolation?: DrivingInterpolationOptions;
};

export class NetworkDrivingSession {
  private readonly runtime: ClientRuntime<
    AuthoritativeDrivingInput,
    AuthoritativeDrivingSnapshot,
    AuthoritativeDrivingEvent
  >;
  private readonly snapshots: DrivingSnapshotBuffer;
  private readonly eventHandlers = new Set<(event: AuthoritativeDrivingEvent) => void>();
  private readonly stateHandlers = new Set<(state: ClientRuntimeState) => void>();
  private readonly errorHandlers = new Set<(error: ClientRuntimeError) => void>();
  private lastPaused: boolean | undefined;

  constructor(options: NetworkDrivingSessionOptions) {
    this.snapshots = new DrivingSnapshotBuffer(options.interpolation);
    this.runtime = new ClientRuntime({
      peer: options.peer,
      codec: new GameNetCodec(configurableDrivingPayloadCodec),
      gameId: PRODUCTION_DRIVING_GAME_ID,
      rulesetId: CONFIGURABLE_DRIVING_RULESET_ID,
    });
    this.runtime.onSnapshot((message) => {
      const paused = message.snapshot.paused;
      if (this.lastPaused !== undefined && paused !== undefined && paused !== this.lastPaused) {
        this.snapshots.clear();
      }
      if (paused !== undefined) this.lastPaused = paused;
      this.snapshots.push(message.tick, message.snapshot);
    });
    this.runtime.onEvent((message) => {
      if (message.event.type === "configuration") this.snapshots.clear();
      for (const handler of this.eventHandlers) handler(message.event);
    });
    this.runtime.onState((state) => {
      if (state === "closed") {
        this.snapshots.clear();
        this.lastPaused = undefined;
      }
      for (const handler of this.stateHandlers) handler(state);
    });
    this.runtime.onError((error) => {
      for (const handler of this.errorHandlers) handler(error);
    });
  }

  get state() {
    return this.runtime.state;
  }

  get playerId() {
    return this.runtime.playerId;
  }

  start() {
    this.runtime.start();
  }

  sendInput(input: AuthoritativeDrivingInput) {
    return this.runtime.sendInput(input);
  }

  sample(now?: number) {
    return this.snapshots.sample(now);
  }

  close() {
    this.runtime.close();
  }

  onState(handler: (state: ClientRuntimeState) => void) {
    this.stateHandlers.add(handler);
    handler(this.runtime.state);
  }

  onEvent(handler: (event: AuthoritativeDrivingEvent) => void) {
    this.eventHandlers.add(handler);
  }

  onError(handler: (error: ClientRuntimeError) => void) {
    this.errorHandlers.add(handler);
  }
}
