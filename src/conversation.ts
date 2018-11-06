import {
  NotificationHandler,
  RequestHandler,
  createResult,
  RequestCreator,
  NotificationCreator,
  Creator,
  CreatorKind,
  StandardErrorCode,
  RpcError,
  ResultCreator,
  RequestError,
  RpcMessage,
  createRequest,
} from "./support";
import { Client } from "./client";
import * as net from "net";
import * as split2 from "split2";
var debug = require("debug")("butlerd:conversation");

interface RequestHandlers {
  [method: string]: RequestHandler<any, any>;
}

interface NotificationHandlers {
  [method: string]: NotificationHandler<any>;
}

interface OutboundRequest {
  resolve: (payload: any) => void;
  reject: (err: Error) => void;
}

const genericResult = createResult<void>();

const debugNoop = (...args: any[]) => {};

const MetaAuthenticate = createRequest<
  {
    secret: string;
  },
  {
    ok: boolean;
  }
>("Meta.Authenticate");

const ProxyConnect = createRequest<
  {
    address: string;
  },
  {
    ok: boolean;
  }
>("Proxy.Connect");

export class Conversation {
  static ErrorMessages = {
    Cancelled: "JSON-RPC conversation cancelled",
    TimedOut: "JSON-RPC connection timed out",
    SocketClosed: "JSON-RPC socket closed by remote peer",
  };

  private cancelled: boolean = false;
  private closed: boolean = false;
  private notificationHandlers: NotificationHandlers = {};
  private missingNotificationHandlersWarned: { [key: string]: boolean } = {};
  private requestHandlers: RequestHandlers = {};
  private client: Client;
  private inboundRequests: {
    [key: number]: boolean;
  } = {};
  private outboundRequests: {
    [key: number]: OutboundRequest;
  } = {};
  private firstMethod: string;

  private socket: net.Socket;

  constructor(client: Client) {
    this.client = client;
    this.socket = new net.Socket();
  }

  async connect() {
    let { endpoint } = this.client;

    const p = new Promise((resolve, reject) => {
      let sock = this.socket;

      let onConnect = () => {
        resolve();
      };
      setTimeout(() => {
        reject(new Error(Conversation.ErrorMessages.TimedOut));
      }, 1 * 1000);

      sock.on("error", e => {
        if (!this.cancelled) {
          this.client.warn(`Encountered socket error: ${e}`);
        }
        reject(e);
      });
      sock.on("close", () => {
        this.close();
        reject(new Error(Conversation.ErrorMessages.SocketClosed));
      });

      let { host, port } = this.client.proxy || this.client;
      sock.connect({ host, port }, onConnect);
      sock.pipe(split2(JSON.parse)).on("data", (message: any) => {
        this.handleMessage(message as RpcMessage).catch(e => {
          this.client.warn(`While processing message: ${e.stack}`);
        });
      });
    });
    p.catch(e => {}); // avoid unhandled rejections

    if (this.cancelled) {
      throw new Error(Conversation.ErrorMessages.Cancelled);
    }

    await p;

    if (this.client.proxy) {
      await this.internalCall(ProxyConnect, {
        address: `${endpoint.tcp.address}`,
      });
    }
    await this.internalCall(MetaAuthenticate, { secret: endpoint.secret });
  }

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

  private async handleMessage(payload: RpcMessage) {
    if (this.cancelled) {
      return;
    }

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
        if (!this.missingNotificationHandlersWarned[payload.method]) {
          this.missingNotificationHandlersWarned[payload.method] = true;
          this.client.warn(
            `no handler for notification ${payload.method} (in ${this
              .firstMethod} convo)`,
          );
        }
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
        this.inboundRequests[payload.id] = true;

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
        delete this.inboundRequests[payload.id];
      }
      return;
    }

    if (payload.result || payload.error) {
      let req = this.outboundRequests[payload.id];
      delete this.outboundRequests[payload.id];
      if (payload.error) {
        req.reject(new RequestError(payload.error));
      } else {
        req.resolve(payload.result);
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

    this.write(obj);
  }

  async call<T, U>(rc: RequestCreator<T, U>, params: T): Promise<U> {
    if (!this.firstMethod) {
      this.firstMethod = rc({} as any)(this.client).method;
    }
    return await this.internalCall(rc, params);
  }

  private async internalCall<T, U>(
    rc: RequestCreator<T, U>,
    params: T,
  ): Promise<U> {
    const obj = rc(params || ({} as T))(this.client);
    if (typeof obj.id !== "number") {
      throw new Error(`missing id in request ${JSON.stringify(obj)}`);
    }

    let method = obj.method;
    const debugReal = debug;

    {
      const debug = method === "Meta.Authenticate" ? debugNoop : debugReal;
      debug("→ %o", method);

      let sentAt = Date.now();

      try {
        const res = await new Promise<U>((resolve, reject) => {
          this.outboundRequests[obj.id] = { resolve, reject };
          this.write(obj);
        });
        debug("← %o (%oms)", method, Date.now() - sentAt);
        return res;
      } catch (err) {
        debug("⇷ %o (%oms): %s", method, Date.now() - sentAt, err.message);
        throw err;
      } finally {
        delete this.outboundRequests[obj.id];
      }
    }
  }

  private write(obj: any) {
    if (this.cancelled) {
      debug(`Refusing to write object to cancelled connection`);
      return;
    }
    let payload = JSON.stringify(obj);
    this.socket.write(payload);
    this.socket.write("\n");
  }

  cancel() {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    this.socket.end();

    for (const id of Object.keys(this.outboundRequests)) {
      let req = this.outboundRequests[id];
      req.reject(new Error(Conversation.ErrorMessages.Cancelled));
    }
    this.outboundRequests = {};
  }

  close() {
    if (this.closed) {
      return;
    }
    this.cancel();
    this.closed = true;
  }
}
