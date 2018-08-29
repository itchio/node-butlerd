import { Feed, Request } from "./transport-types";
import { Endpoint } from "./support";

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
  post(opts: PostOptions): Request;
  makeFeed(cid: string): Feed;
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

  makeFeedURL(cid: string) {
    const { secret } = this.endpoint;
    return this.makeURL(`feed?secret=${secret}&cid=${cid}`);
  }

  postHeaders(opts: PostOptions): any {
    const { secret } = this.endpoint;
    return {
      accept: "application/json",
      connection: "close",
      "content-type": "application/json",
      "cache-control": "no-cache",
      "x-secret": secret,
      ...opts.headers,
    };
  }

  feedHeaders(): any {
    return {
      accept: "text/event-stream",
      connection: "close",
      "cache-control": "no-cache",
    };
  }
}
