# CBOR implementation decision

Status: accepted for the TypeScript GameNet v1 implementation.

## Decision

Use [`cbor2`](https://www.npmjs.com/package/cbor2) behind `ProtocolCodec`. It is an implementation detail, not part of the protocol contract.

The evaluation considered `cborg`, `cbor2`, and `cbor-x` against GameNet's strict decode requirements.

| Requirement | `cborg` | `cbor2` | `cbor-x` |
| --- | :---: | :---: | :---: |
| Reject duplicate map keys | Option | Option | No; last value wins |
| Reject indefinite-length values | Option | Option | Not selected for strict policy |
| Reject trailing data | Yes | Yes | Configurable behavior not preferred |
| Reject tags | Default | Post-decode with global tags disabled | No; broad built-in extension support |
| Reject NaN/infinity | Options | Post-decode validation | Post-decode validation |
| Decoder maximum depth | No direct option | Option | Has broad limits, but less strict surface |
| Preserve integer-keyed maps | Option | Option | Option |
| Avoid proprietary extensions | Yes | Yes with global tags disabled | Requires disabling records and extensions |
| Browser-compatible ESM | Yes | Yes | Yes |

`cborg` was a close alternative and has excellent strictness defaults, but it does not expose a decoder depth limit. `cbor-x` optimizes for speed and extended JavaScript fidelity; its duplicate-key behavior and built-in tag/record surface conflict with the fail-closed protocol boundary.

`cbor2` provides the best fit because it rejects duplicate keys and streaming/indefinite values, rejects trailing data, enforces maximum depth while tokenizing, preserves maps, uses fatal UTF-8 decoding, and can disable global tag interpretation. GameNet then applies its own recursive type and size validation before exposing values to message decoders.

## Required configuration

The codec must use the equivalent of:

```ts
{
  maxDepth: 12,
  rejectStreaming: true,
  rejectDuplicateKeys: true,
  rejectUndefined: true,
  rejectSimple: true,
  preferMap: true,
  ignoreGlobalTags: true
}
```

Decoded values are still recursively checked to reject tag wrappers, unsupported objects, non-finite numbers, unsafe integers, oversized arrays/maps/text/bytes, and non-integer map keys. Packet byte limits are checked before CBOR decoding.

No `cbor2` type, tag, global registration, or option leaks into the public protocol or transport API. Replacing the library must preserve all codec fixtures.
