import { EventSourceInstance } from "./transport-types";
import { Endpoint } from "./support";

export interface TransportMessageListener {
  (msg: any): void;
}

export interface TransportErrorListener {
  (err: Error): void;
}

export type AbortFunc = () => void;

export interface PostOptions {
  path: string;
  headers: {
    [key: string]: string;
  };
  payload: Object;
  registerAbort?: (af: AbortFunc) => void;
}

export interface Transport {
  post(opts: PostOptions): Promise<any>;
  makeEventSource(
    cid: number,
    onMessage: TransportMessageListener,
    onError: TransportErrorListener,
  ): Promise<EventSourceInstance>;
}

export class BaseTransport {
  protected endpoint: Endpoint;

  constructor(endpoint: Endpoint) {
    this.endpoint = endpoint;
  }

  makeURL(path: string) {
    const { address } = this.endpoint.http;
    return `http://${address}/${path}`;
  }
}
