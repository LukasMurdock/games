import { encodeBase64Url } from "./fragment";

export type DirectHandoffResult = {
  accepted: boolean;
  message?: string;
};

type ResponseMessage = {
  type: "response";
  handoffId: string;
  fragment: string;
};

type AcknowledgementMessage = {
  type: "ack";
  handoffId: string;
  accepted: boolean;
  message?: string;
};

export function directHandoffChannelName(sessionId: Uint8Array) {
  return `gamenet-direct-v1:${encodeBase64Url(sessionId)}`;
}

export class DirectResponseReceiver {
  private readonly channel: BroadcastChannel;

  constructor(
    sessionId: Uint8Array,
    private readonly consume: (fragment: string) => Promise<DirectHandoffResult>,
  ) {
    this.channel = new BroadcastChannel(directHandoffChannelName(sessionId));
    this.channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      void this.receive(event.data);
    });
  }

  close() {
    this.channel.close();
  }

  private async receive(value: unknown) {
    if (!isResponseMessage(value)) return;
    let result: DirectHandoffResult;
    try {
      result = await this.consume(value.fragment);
    } catch {
      result = { accepted: false, message: "Host could not consume the response." };
    }
    const acknowledgement: AcknowledgementMessage = {
      type: "ack",
      handoffId: value.handoffId,
      accepted: result.accepted,
      ...(result.message === undefined ? {} : { message: result.message }),
    };
    this.channel.postMessage(acknowledgement);
  }
}

export function handoffDirectResponse(
  sessionId: Uint8Array,
  fragment: string,
  timeoutMs = 4_000,
): Promise<DirectHandoffResult> {
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(directHandoffChannelName(sessionId));
    const handoffId = crypto.randomUUID();
    let settled = false;
    const finish = (result: DirectHandoffResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      channel.close();
      resolve(result);
    };
    const timeout = setTimeout(() => {
      finish({ accepted: false, message: "No matching host tab acknowledged this response." });
    }, timeoutMs);
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      const value = event.data;
      if (!isAcknowledgement(value) || value.handoffId !== handoffId) return;
      finish({ accepted: value.accepted, ...(value.message === undefined ? {} : { message: value.message }) });
    });
    const message: ResponseMessage = { type: "response", handoffId, fragment };
    channel.postMessage(message);
  });
}

function isResponseMessage(value: unknown): value is ResponseMessage {
  return Boolean(
    value
    && typeof value === "object"
    && "type" in value
    && value.type === "response"
    && "handoffId" in value
    && typeof value.handoffId === "string"
    && "fragment" in value
    && typeof value.fragment === "string",
  );
}

function isAcknowledgement(value: unknown): value is AcknowledgementMessage {
  return Boolean(
    value
    && typeof value === "object"
    && "type" in value
    && value.type === "ack"
    && "handoffId" in value
    && typeof value.handoffId === "string"
    && "accepted" in value
    && typeof value.accepted === "boolean"
    && (!("message" in value) || value.message === undefined || typeof value.message === "string"),
  );
}
