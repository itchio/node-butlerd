var debug = require("debug")("butlerd:transport-generic");
import { Endpoint } from "./support";
import {
  Transport,
  TransportMessageListener,
  TransportErrorListener,
  PostOptions,
} from "./transport";

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
  fetchOpts: Partial<FetchOpts> | null;
  eventSourceOpts: Partial<EventSourceOpts> | null;
}

export class GenericTransport implements Transport {
  private endpoint: Endpoint;

  private impls: TransportImplementations;
  private fetch: FetchImpl;

  constructor(endpoint: Endpoint, impls: TransportImplementations) {
    this.endpoint = endpoint;
    this.impls = impls;
    // weird workaround - if we don't do that we end up
    // with 'Illegal invocation of fetch, cannot call on Window'
    this.fetch = impls.fetch.bind(undefined);
  }

  async makeEventSource(
    cid: number,
    onMessage: TransportMessageListener,
    onError: TransportErrorListener,
  ): Promise<EventSourceInstance> {
    const p = new Promise<EventSourceInstance>((resolve, reject) => {
      const url = this.makeURL(
        `feed?secret=${this.endpoint.secret}&cid=${cid}`,
      );
      debug(`GET ${url}`);
      let source = new this.impls.EventSource(url, this.impls.eventSourceOpts);
      source.onmessage = ev => {
        debug(`SSE message: ${(ev as any).data}`);
        onMessage((ev as any).data);
      };

      source.onerror = ev => {
        const err = new Error(
          `EventSource error: ${JSON.stringify(ev, null, 2)}`,
        );
        debug(`SSE error: ${err.stack}`);
        reject(err);
        onError(err);
      };

      source.onopen = ev => {
        resolve(source);
      };
    });
    return await p;
  }

  async post(opts: PostOptions) {
    const url = this.makeURL(opts.path);
    debug(`POST ${url}`);
    let headers = {
      "content-type": "application/json",
      "x-secret": this.endpoint.secret,
      ...opts.headers,
    };

    const res = await this.fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.payload),
      ...this.impls.fetchOpts,
    } as any);

    switch (res.status) {
      case 200:
        return await res.json();
      case 204:
        return null;
      default:
        throw new Error(`Got HTTP ${res.status}: ${await res.text()}`);
    }
  }

  makeURL(path: string) {
    const { address } = this.endpoint.https;
    return `https://${address}/${path}`;
  }
}
