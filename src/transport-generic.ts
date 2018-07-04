import { Endpoint } from "./support";
import {
  Transport,
  TransportMessageListener,
  TransportErrorListener,
} from "./transport";

import { Agent } from "https";
import {
  EventSourceImpl,
  FetchImpl,
  EventSourceInstance,
  FetchOpts,
  EventSourceOpts,
} from "./transport-types";

export interface TransportImplementations {
  EventSource: EventSourceImpl;
  fetch: FetchImpl;
  getFetchOpts: (endpoint: Endpoint) => Partial<FetchOpts> | null;
  getEventSourceOpts: (endpoint: Endpoint) => Partial<EventSourceOpts> | null;
}

export class GenericTransport implements Transport {
  private clientId: string;
  private endpoint: Endpoint;

  private source: EventSourceInstance;
  private onError: TransportErrorListener;
  private onMessage: TransportMessageListener;

  private impls: TransportImplementations;

  private agent: Agent;

  constructor(impls: TransportImplementations) {
    this.impls = impls;
  }

  async connect(endpoint: Endpoint, clientId: string) {
    this.endpoint = endpoint;
    this.clientId = clientId;

    {
      this.agent = new Agent({
        ca: endpoint.cert,
      });
    }

    await new Promise((resolve, reject) => {
      const url = this.makeURL("");
      this.source = new this.impls.EventSource(
        url,
        this.impls.getEventSourceOpts(endpoint),
      );
      this.source.onmessage = ev => {
        if (this.onMessage) {
          this.onMessage((ev as any).data);
        }
      };

      this.source.onerror = ev => {
        const err = new Error(
          `EventSource error: ${JSON.stringify(ev, null, 2)}`,
        );
        reject(err);
        if (this.onError) {
          this.onError(err);
        }
      };
      this.source.onopen = ev => {
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
    const res = await this.impls.fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      ...this.impls.getFetchOpts(this.endpoint),
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
