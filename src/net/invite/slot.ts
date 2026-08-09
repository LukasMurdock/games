import { verifyDirectResponse } from "./proof";
import type { DirectInvite, DirectResponse } from "./types";

export type ConsumeDirectResponseResult =
  | { ok: true; answerSdp: string }
  | { ok: false; reason: "consumed" | "expired" | "invalid-response" };

export class DirectInviteSlot {
  private state: "open" | "verifying" | "consumed" = "open";

  constructor(
    readonly invite: DirectInvite,
    private readonly nowSeconds: () => number = () => Date.now() / 1000,
  ) {}

  get consumed() {
    return this.state === "consumed";
  }

  async consume(response: DirectResponse): Promise<ConsumeDirectResponseResult> {
    if (this.state !== "open") return { ok: false, reason: "consumed" };
    if (this.invite.expiresAt !== undefined && this.nowSeconds() >= this.invite.expiresAt) {
      return { ok: false, reason: "expired" };
    }
    this.state = "verifying";
    try {
      if (!await verifyDirectResponse(this.invite, response)) {
        this.state = "open";
        return { ok: false, reason: "invalid-response" };
      }
      this.state = "consumed";
      return { ok: true, answerSdp: response.answerSdp };
    } catch {
      this.state = "open";
      return { ok: false, reason: "invalid-response" };
    }
  }
}
