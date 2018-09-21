import {
  RequestHandler,
  NotificationHandler,
  ErrorHandler,
  WarningHandler,
  Endpoint,
  RequestCreator,
  NotificationCreator,
  Creator,
  CreatorKind,
  RequestError,
  ResultCreator,
  RpcError,
  StandardErrorCode,
  createResult,
} from "./support";
import { Transport } from "./transport";
import { Request, Feed } from "./transport-types";
const uuid = require("uuid");

var debug = require("debug")("butlerd:client");

interface RequestHandlers {
  [method: string]: RequestHandler<any, any>;
}

interface NotificationHandlers {
  [method: string]: NotificationHandler<any>;
}

const genericResult = createResult<void>();

export type SetupFunc = (c: Conversation) => void;

export class Client {
  errorHandler: ErrorHandler = null;
  warningHandler: WarningHandler = null;
  endpoint: Endpoint;
  clientId: string;
  transport: Transport;

  idSeed = 1;

  constructor(endpoint: Endpoint, transport: Transport) {
    this.endpoint = endpoint;
    this.clientId = `client-${(Math.random() * 1024 * 1024).toFixed(0)}`;

    this.transport = transport;
  }

  generateID(): number {
    return this.idSeed++;
  }

  generateCID(): string {
    return uuid.v4();
  }

  warn(msg: string) {
    if (this.warningHandler) {
      try {
        this.warningHandler(msg);
        return;
      } catch (e) {}
    }
    console.warn(msg);
  }

  onError(handler: ErrorHandler) {
    this.errorHandler = handler;
  }

  onWarning(handler: WarningHandler) {
    this.warningHandler = handler;
  }

  async call<T, U>(
    rc: RequestCreator<T, U>,
    params: T,
    setup?: SetupFunc,
  ): Promise<U> {
    const obj = rc(params || ({} as T))(this);
    if (typeof obj.id !== "number") {
      throw new Error(`missing id in request ${JSON.stringify(obj)}`);
    }

    let method = obj.method;
    if (setup) {
      debug("⇒ %o", method);
    } else {
      debug("→ %o", method);
    }

    let sentAt = Date.now();

    let headers: { [key: string]: string } = {
      "x-id": `${obj.id}`,
    };
    let conversation: Conversation;

    // in-convo request
    try {
      if (setup) {
        const cid = this.generateCID();
        conversation = new Conversation(cid, this);
        setup(conversation);
        await conversation.connect();
        headers["x-cid"] = `${cid}`;
      }

      const path = `call/${obj.method}`;
      const req = this.transport.post({
        path,
        payload: obj.params,
        headers,
      });
      if (conversation) {
        conversation.req = req;
      }

      const res = await req.do();
      if (res.error) {
        throw new RequestError(res.error);
      }
      debug("← %o (%oms)", method, Date.now() - sentAt);
      return res.result;
    } catch (err) {
      debug("⇷ %o (%oms): %s", method, Date.now() - sentAt, err.message);
      throw err;
    } finally {
      if (conversation) {
        conversation.close();
      }
    }
  }
}

export class Conversation {
  private cancelled: boolean = false;
  private closed: boolean = false;
  private notificationHandlers: NotificationHandlers = {};
  private requestHandlers: RequestHandlers = {};
  private client: Client;
  private cid: string;
  private feed: Feed;
  private inFlightRequests: {
    [key: number]: boolean;
  } = {};
  public req: Request;

  constructor(cid: string, client: Client) {
    this.cid = cid;
    this.client = client;
  }

  async connect() {
    if (this.cancelled) {
      throw new Error(`Conversation cancelled`);
    }
    this.feed = this.client.transport.makeFeed(this.cid);

    const { onMessage, onError } = this;
    await this.feed.connect({ onMessage, onError });
  }

  onMessage = (payloadJSON: string) => {
    this.handleMessage(payloadJSON).catch(e => {
      console.error(`EventSource handleMessage error: ${e}`);
    });
  };

  onError = (err: Error) => {
    console.error(`EventSource error: ${err.stack || err}`);
  };

  on<T, U>(rc: RequestCreator<T, U>, handler: (p: T) => Promise<U>);
  on<T>(nc: NotificationCreator<T>, handler: (p: T) => Promise<void>);

  on<T>(c: Creator<T>, handler: (p: any) => Promise<any>) {
    if (c.__kind === CreatorKind.Request) {
      this.onRequest(
        c as RequestCreator<any, any>,
        async payload => await handler(payload.params),
      );
    } else if (c.__kind === CreatorKind.Notification) {
      this.onNotification(
        c as NotificationCreator<any>,
        async payload => await handler(payload.params),
      );
    } else {
      throw new Error(`Unknown creator passed (not request nor notification)`);
    }
  }

  onRequest<T, U>(rc: RequestCreator<T, U>, handler: RequestHandler<T, U>) {
    const sample = rc(null)(this.client);
    const { method } = sample;

    if (this.requestHandlers[method]) {
      throw new Error(`cannot register a second request handler for ${method}`);
    }
    this.requestHandlers[method] = handler;
  }

  onNotification<T>(
    nc: NotificationCreator<T>,
    handler: NotificationHandler<T>,
  ) {
    const example = nc(null);
    const { method } = example;

    if (this.notificationHandlers[method]) {
      throw new Error(
        `cannot register a second notification handler for ${method}`,
      );
    }
    this.notificationHandlers[method] = handler;
  }

  private async handleMessage(payloadJSON: any) {
    if (this.cancelled) {
      return;
    }

    let payload: any = JSON.parse(payloadJSON);

    if (typeof payload !== "object") {
      return;
    }

    if (payload.jsonrpc != "2.0") {
      return;
    }

    if (typeof payload.id === "undefined") {
      // we got a notification!
      const handler = this.notificationHandlers[payload.method];
      if (!handler) {
        this.client.warn(`no handler for notification ${payload.method}`);
        return;
      }

      try {
        await Promise.resolve(handler(payload));
      } catch (e) {
        this.client.warn(`notification handler error: ${e.stack}`);
        if (this.client.errorHandler) {
          this.client.errorHandler(e);
        }
      }

      return;
    }

    if (payload.method) {
      debug("⇐ %o", payload.method);

      try {
        this.inFlightRequests[payload.id] = true;

        let receivedAt = Date.now();
        const handler = this.requestHandlers[payload.method];
        if (!handler) {
          if (this.cancelled) {
            return;
          }
          this.sendResult(genericResult, payload.id, null, <RpcError>{
            code: StandardErrorCode.MethodNotFound,
            message: `no handler is registered for method ${payload.method}`,
          });
          return;
        }

        let retval: any;
        try {
          retval = handler(payload);
        } catch (e) {
          if (this.cancelled) {
            return;
          }
          this.sendResult(genericResult, payload.id, null, <RpcError>{
            code: StandardErrorCode.InternalError,
            message: `sync error: ${e.message}`,
            data: {
              stack: e.stack,
            },
          });
          return;
        }

        try {
          const result = await Promise.resolve(retval);
          debug("⇒ %o (%oms)", payload.method, Date.now() - receivedAt);
          if (this.cancelled) {
            return;
          }
          this.sendResult(genericResult, payload.id, result, null);
        } catch (e) {
          if (this.cancelled) {
            return;
          }
          this.sendResult(genericResult, payload.id, null, <RpcError>{
            code: StandardErrorCode.InternalError,
            message: `async error: ${e.message}`,
            data: {
              stack: e.stack,
            },
          });
        }
      } finally {
        delete this.inFlightRequests[payload.id];
      }
      return;
    }

    if (this.cancelled) {
      return;
    }
    this.sendResult(genericResult, payload.id, null, <RpcError>{
      code: StandardErrorCode.InvalidRequest,
      message: "has id but doesn't have method, result, or error",
    });
  }

  sendResult<T>(
    rc: ResultCreator<T>,
    id: number,
    result?: T,
    error?: RpcError,
  ) {
    const obj = rc(id, result, error);
    if (typeof obj.id !== "number") {
      throw new Error(`missing id in result ${JSON.stringify(obj)}`);
    }

    const req = this.client.transport.post({
      path: "reply",
      payload: obj,
      headers: {
        "x-cid": `${this.cid}`,
      },
    });

    req.do().catch(e => {
      this.client.warn(`could not send result for ${obj.id}: ${e.stack}`);
    });
  }

  cancel() {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;

    if (this.req) {
      this.req.close();
    }

    if (this.feed) {
      this.feed.close();
    }

    for (const id of Object.keys(this.inFlightRequests)) {
      this.sendResult(genericResult, parseInt(id, 10), null, <RpcError>{
        code: StandardErrorCode.InvalidRequest,
        message: `Conversation cancelled`,
      });
    }
  }

  close() {
    if (this.closed) {
      return;
    }

    this.cancel();
    this.closed = true;
  }
}
