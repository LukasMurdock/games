# Direct Invite v1 permanent registry

Status: normative draft.

IDs are decimal, scoped as stated, permanent after publication, and never reused. Removed IDs remain `RESERVED`.

## Envelope types

| ID | Name | Meaning |
| ---: | --- | --- |
| 0 | `DIRECT_INVITE` | Host offer and one-use slot capability |
| 1 | `DIRECT_RESPONSE` | Client answer bound to an invite |
| 2–31 | `RESERVED CORE` | Invalid in v1 |

## Invite body fields

| ID | Name | Required |
| ---: | --- | :---: |
| 0 | Direct Invite format version | Yes |
| 1 | 128-bit session ID | Yes |
| 2 | Unsigned 32-bit peer slot | Yes |
| 3 | Complete offer SDP | Yes |
| 4 | 256-bit invite secret | Yes |
| 5 | Expiry as Unix seconds | No |

## Response body fields

| ID | Name | Required |
| ---: | --- | :---: |
| 0 | Direct Invite format version | Yes |
| 1 | Session ID copied from invite | Yes |
| 2 | Peer slot copied from invite | Yes |
| 3 | Complete answer SDP | Yes |
| 4 | HMAC-SHA-256 response proof | Yes |

Unknown unsigned 16-bit integer fields are validated against Direct Invite structural limits and ignored. Duplicate keys and non-integer map keys are invalid.

The format version is independent from GameNet's negotiated gameplay major. Version 1 uses non-trickle ICE, so gathered candidates are contained in SDP rather than a separate field.
