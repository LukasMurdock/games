import { describe, expect, it } from "vitest";
import { DirectResponseReceiver, directHandoffChannelName, handoffDirectResponse } from "./handoff";

const sessionId = new Uint8Array(16).fill(9);

describe("Direct Response handoff", () => {
  it("uses a capability-free session-specific channel name", () => {
    expect(directHandoffChannelName(sessionId)).toBe("gamenet-direct-v1:CQkJCQkJCQkJCQkJCQkJCQ");
  });

  it("hands a response to the matching receiver and acknowledges it", async () => {
    const receiver = new DirectResponseReceiver(sessionId, async (fragment) => ({
      accepted: fragment === "#response=test",
      message: "connected",
    }));

    await expect(handoffDirectResponse(sessionId, "#response=test", 1_000)).resolves.toEqual({
      accepted: true,
      message: "connected",
    });
    receiver.close();
  });

  it("returns a safe fallback when no host tab responds", async () => {
    await expect(handoffDirectResponse(new Uint8Array(16).fill(8), "#response=test", 5))
      .resolves.toEqual({
        accepted: false,
        message: "No matching host tab acknowledged this response.",
      });
  });
});
