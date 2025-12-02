import {
  NotificationHandler,
  RequestHandler,
  createResult,
  RequestCreator,
  NotificationCreator,
  StandardErrorCode,
  RpcError,
  ResultCreator,
  RequestError,
  RpcMessage,
  createRequest,
  InternalCode,
} from "./support";
import { Client } from "./client";
import * as net from "net";
import split2 from "split2";

export const CONNECTION_TIMEOUT = 2000; // 2s timeouts, out to be enough for loopback connections..

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

const genericResult = createResult<any>();

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
  private firstMethod?: string;

  private socket: net.Socket;

  constructor(client: Client) {
    this.client = client;
    this.socket = new net.Socket();
  }

  async connect() {
    let { endpoint } = this.client;

    const p = new Promise<void>((resolve, reject) => {
      let sock = this.socket;

      let onConnect = () => {
        resolve();
      };
      setTimeout(() => {
        reject(RequestError.fromInternalCode(InternalCode.ConnectionTimedOut));
      }, CONNECTION_TIMEOUT);

      sock.on("error", (e) => {
        reject(e);
      });
      sock.on("close", () => {
        this.close();
        reject(RequestError.fromInternalCode(InternalCode.SocketClosed));
      });

      let { host, port } = this.client.proxy || this.client;
      sock.connect({ host, port }, onConnect);
      sock.pipe(split2(JSON.parse)).on("data", (message: any) => {
        this.handleMessage(message as RpcMessage).catch((e) => {
          this.client.warn(`While processing message: ${e.stack}`);
        });
      });
    });
    p.catch((e) => {}); // avoid unhandled rejections

    if (this.cancelled) {
      throw RequestError.fromInternalCode(InternalCode.ConversationCancelled);
    }

    await p;

    if (this.client.proxy) {
      await this.internalCall(ProxyConnect, {
        address: `${endpoint.tcp.address}`,
      });
    }
    await this.internalCall(MetaAuthenticate, { secret: endpoint.secret });
  }

  onRequest<Params, Result>(
    rc: RequestCreator<Params, Result>,
    handler: RequestHandler<Params, Result>,
  ) {
    if (this.requestHandlers[rc.__method]) {
      throw new Error(
        `cannot register a second request handler for ${rc.__method}`,
      );
    }
    this.requestHandlers[rc.__method] = handler;
  }

  onNotification<T>(
    nc: NotificationCreator<T>,
    handler: NotificationHandler<T>,
  ) {
    if (this.notificationHandlers[nc.__method]) {
      throw new Error(
        `cannot register a second notification handler for ${nc.__method}`,
      );
    }
    this.notificationHandlers[nc.__method] = handler;
  }

  private async handleMessage(msg: RpcMessage) {
    if (this.cancelled) {
      return;
    }

    if (typeof msg !== "object") {
      return;
    }

    if (msg.jsonrpc != "2.0") {
      return;
    }

    if (typeof msg.id === "undefined") {
      // we got a notification!
      const handler = this.notificationHandlers[msg.method];
      if (!handler) {
        if (!this.missingNotificationHandlersWarned[msg.method]) {
          this.missingNotificationHandlersWarned[msg.method] = true;
          this.client.warn(
            `no handler for notification ${msg.method} (in ${this.firstMethod} convo)`,
          );
        }
        return;
      }

      try {
        await Promise.resolve(handler(msg.params));
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        this.client.warn(`notification handler error: ${err.stack}`);
        if (this.client.errorHandler) {
          this.client.errorHandler(err);
        }
      }

      return;
    }

    if (msg.method) {
      try {
        this.inboundRequests[msg.id] = true;

        let receivedAt = Date.now();
        const handler = this.requestHandlers[msg.method];
        if (!handler) {
          if (this.cancelled) {
            return;
          }
          this.sendResult(genericResult, msg.id, null, <RpcError>{
            code: StandardErrorCode.MethodNotFound,
            message: `no handler is registered for method ${msg.method}`,
          });
          return;
        }

        try {
          const result = await handler(msg.params);
          if (this.cancelled) {
            return;
          }
          this.sendResult(genericResult, msg.id, result, undefined);
        } catch (e) {
          if (this.cancelled) {
            return;
          }
          const err = e instanceof Error ? e : new Error(String(e));
          this.sendResult(genericResult, msg.id, null, <RpcError>{
            code: StandardErrorCode.InternalError,
            message: `async error: ${err.message}`,
            data: {
              stack: err.stack,
            },
          });
        }
      } finally {
        delete this.inboundRequests[msg.id];
      }
      return;
    }

    if (msg.result || msg.error) {
      let req = this.outboundRequests[msg.id];
      delete this.outboundRequests[msg.id];
      if (msg.error) {
        req.reject(new RequestError(msg.error));
      } else {
        req.resolve(msg.result);
      }
      return;
    }

    if (this.cancelled) {
      return;
    }
    this.sendResult(genericResult, msg.id, null, <RpcError>{
      code: StandardErrorCode.InvalidRequest,
      message: "has id but doesn't have method, result, or error",
    });
  }

  sendResult<Result>(
    rc: ResultCreator<Result>,
    id: number,
    result?: Result,
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
    {
      let sentAt = Date.now();

      try {
        const res = await new Promise<U>((resolve, reject) => {
          this.outboundRequests[obj.id] = { resolve, reject };
          this.write(obj);
        });
        return res;
      } catch (err) {
        throw err;
      } finally {
        delete this.outboundRequests[obj.id];
      }
    }
  }

  private write(obj: any) {
    if (this.cancelled) {
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

    for (const id of Object.keys(this.outboundRequests)) {
      let req = this.outboundRequests[parseInt(id, 10)];
      req.reject(
        RequestError.fromInternalCode(InternalCode.ConversationCancelled),
      );
    }
    this.outboundRequests = {};
    this.socket.end();
  }

  close() {
    if (this.closed) {
      return;
    }
    this.cancel();
    this.closed = true;
  }
}
