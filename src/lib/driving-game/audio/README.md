# Driving audio architecture

Production vehicle mechanics emit renderer- and engine-independent `CarAudioParameters`. `createCarAudio()` maps that state through a selected transmission and `EngineDefinition`, then sends RPM/load/spool state to one generic order-synthesis AudioWorklet. Engine, tire, and environment buses remain separate until the master compressor, allowing the Maneuver Lab to audition the full mix, engine only, or tires only.

## Engine registry

`engine-types.ts` is the engine plug-in boundary. An engine definition owns:

- identity, title, description, and provenance;
- idle, limiter, and redline RPM;
- 0.5×-order magnitude tables and their RPM centers;
- firing/cylinder texture;
- induction response;
- tonal, turbulent, mechanical, drive, and output character;
- output EQ and a matching default transmission.

Definitions must remain structured-clone-safe because synthesis data crosses into the AudioWorklet through `processorOptions`. The generic worklet contains no registered engine identity or sampled source audio.

To add an engine:

1. Add an `EngineDefinition` to `ENGINE_TYPES`.
2. Supply four equal-length order tables (the reference extraction pipeline produces 32 quantized magnitudes per table).
3. Set firing texture, RPM range, induction, output character, and transmission defaults.
4. Validate idle, pull, circle, and linked-drift traces in `/maneuver-lab/`.
5. Mark uncalibrated engines as `procedural-prototype` until reference evidence supports them.

The production default remains the reference-derived turbo inline-six. The NA V8 and high-revving NA inline-four registrations are explicit procedural prototypes that prove the seam; they are not claims of sample-matched accuracy.
