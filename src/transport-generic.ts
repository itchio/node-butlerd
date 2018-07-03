import { IEndpoint } from "./client";
import {
  Transport,
  TransportMessageListener,
  TransportErrorListener,
} from "./transport";

// this should only be typing
import EventSource = require("eventsource");
import { Agent } from "https";

export class GenericTransport implements Transport {
  private clientId: string;
  private endpoint: IEndpoint;

  private source: EventSource;
  private onError: TransportErrorListener;
  private onMessage: TransportMessageListener;

  private EventSourceImpl: typeof EventSource;
  private fetchImpl: typeof fetch;

  private agent: Agent;

  constructor(EventSourceImpl: typeof EventSource, fetchImpl: typeof fetch) {
    this.EventSourceImpl = EventSourceImpl;
    this.fetchImpl = fetchImpl;
  }

  async connect(endpoint: IEndpoint, clientId: string) {
    this.endpoint = endpoint;
    this.clientId = clientId;

    {
      this.agent = new Agent({
        ca: endpoint.cert,
      });
    }

    await new Promise((resolve, reject) => {
      const url = this.makeURL("");
      this.source = new this.EventSourceImpl(url, {
        https: {
          ca: endpoint.cert,
        },
      });
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

  async post(path: string, payload: any) {
    if (this.closed) {
      throw new Error(`trying to send on disconnected client`);
    }

    const url = this.makeURL(path);
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      agent: this.agent,
    } as any);

    switch (res.status) {
      case 200:
        return await res.json();
      case 204:
        return null;
      default:
        throw new Error(`Got HTTP ${res.status}`);
    }
  }

  makeURL(path: string) {
    const { address } = this.endpoint;
    return `https://${address}/${path}`;
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
