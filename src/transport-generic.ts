import { IEndpoint } from "./client";
import {
  Transport,
  TransportMessageListener,
  TransportErrorListener,
} from "./transport";

// this should only be typing
import EventSource = require("eventsource");

export class GenericTransport implements Transport {
  private clientId: string;
  private endpoint: IEndpoint;

  private source: EventSource;
  private onError: TransportErrorListener;
  private onMessage: TransportMessageListener;

  private EventSourceImpl: typeof EventSource;
  private fetchImpl: typeof fetch;

  constructor(EventSourceImpl: typeof EventSource, fetchImpl: typeof fetch) {
    this.EventSourceImpl = EventSourceImpl;
    this.fetchImpl = fetchImpl;
  }

  async connect(endpoint: IEndpoint, clientId: string) {
    this.endpoint = endpoint;
    this.clientId = clientId;
    await new Promise((resolve, reject) => {
      this.source = new this.EventSourceImpl(
        this.makeURL(`feed?clientId=${clientId}`),
      );
      this.source.onmessage = ev => {
        console.log(`EventSource.onmessage`);
        if (this.onMessage) {
          this.onMessage((ev as any).data);
        }
      };

      this.source.onerror = ev => {
        console.log(`EventSource.onerror`);
        const err = new Error(
          `EventSource error: ${JSON.stringify(ev, null, 2)}`,
        );
        reject(err);
        if (this.onError) {
          this.onError(err);
        }
      };
      this.source.onopen = ev => {
        console.log(`EventSource.onopen`);
        resolve();
      };
    });
  }

  setOnMessage(cb: TransportMessageListener) {
    this.onMessage = cb;
  }

  setOnError(cb: TransportErrorListener) {
    this.onError = cb;
  }

  async post(payload: any) {
    const callUrl = `${this.endpoint.address}/call`;
    const res = await this.fetchImpl(this.makeURL("call"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (res.status != 200) {
      throw new Error(`Expected HTTP 200, got HTTP ${res.status}`);
    }

    return await res.json();
  }

  makeURL(path: string) {
    const { address } = this.endpoint;
    return `https://${address}/${path}?clientId=${this.clientId}`;
  }

  private closed = false;
  close() {
    if (!this.closed) {
      this.closed = true;
      this.source.close();
    }
  }

  isClosed() {
    return this.closed;
  }
}
