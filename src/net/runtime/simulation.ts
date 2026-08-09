export interface GameSimulation<Config, Input, State, Snapshot, Event> {
  create(config: Config): State;
  addPlayer(state: State, playerId: string): readonly Event[] | void;
  removePlayer(state: State, playerId: string): readonly Event[] | void;
  input(state: State, playerId: string, input: Input): readonly Event[] | void;
  tick(state: State, dt: number): readonly Event[] | void;
  snapshot(state: State): Snapshot;
}
