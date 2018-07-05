import { Endpoint } from "./support";
import { EventSourceInstance } from "./transport-types";

export interface TransportMessageListener {
  (msg: any): void;
}

export interface TransportErrorListener {
  (err: Error): void;
}

export interface PostOptions {
  path: string;
  headers: {
    [key: string]: string;
  };
  payload: Object;
}

export interface Transport {
  post(opts: PostOptions): Promise<any>;
  makeEventSource(
    cid: number,
    onMessage: TransportMessageListener,
    onError: TransportErrorListener,
  ): Promise<EventSourceInstance>;
}
