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

var debug = require("debug")("butlerd:client");

interface ResultPromises {
  [key: number]: {
    resolve: (payload: any) => void;
    reject: (e: Error) => void;
  };
}

interface RequestHandlers {
  [method: string]: RequestHandler<any, any>;
}

interface NotificationHandlers {
  [method: string]: NotificationHandler<any>;
}

const genericResult = createResult<void>();

export class Client {
  private resultPromises: ResultPromises = {};
  private requestHandlers: RequestHandlers = {};
  private notificationHandlers: NotificationHandlers = {};
  private errorHandler: ErrorHandler = null;
  private warningHandler: WarningHandler = null;
  private endpoint: Endpoint;
  private clientId: string;
  private transport: Transport;
  idSeed = 0;

  constructor(endpoint: Endpoint, transport: Transport) {
    this.endpoint = endpoint;
    this.clientId = `client-${(Math.random() * 1024 * 1024).toFixed(0)}`;

    this.transport = transport;
  }

  generateID(): number {
    return this.idSeed++;
  }

  async connect() {
    this.transport.setOnMessage((msg: any) => {
      console.log(`Client received message! `, msg);
      this.handleMessage(msg).catch(e => {
        this.warn(e.stack);
      });
    });

    this.transport.setOnError((e: Error) => {
      this.shutdown(e);
    });

    console.log(`Calling transport.connect...`);
    await this.transport.connect(this.endpoint, this.clientId);
    console.log(`transport.connect returned`);
  }

  private shutdown(e: Error) {
    this.transport.close();

    for (const key of Object.keys(this.resultPromises)) {
      const rp = this.resultPromises[key];
      rp.reject(e);
    }
    this.resultPromises = {};
  }

  private warn(msg: string) {
    if (this.warningHandler) {
      try {
        this.warningHandler(msg);
        return;
      } catch (e) {}
    }
    console.warn(msg);
  }

  close() {
    this.transport.close();
    this.shutdown(new Error("connection closed by client"));
  }

  onError(handler: ErrorHandler) {
    this.errorHandler = handler;
  }

  onWarning(handler: WarningHandler) {
    this.warningHandler = handler;
  }

  on<T, U>(rc: RequestCreator<T, U>, handler: (p: T) => Promise<U>);
  on<T>(nc: NotificationCreator<T>, handler: (p: T) => Promise<void>);

  on(c: Creator, handler: (p: any) => Promise<any>) {
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
    const sample = rc(null)(this);
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

  notify<T>(nc: NotificationCreator<T>, params?: T) {
    const obj = nc(params);
  }

  async call<T, U>(rc: RequestCreator<T, U>, params: T): Promise<U> {
    const obj = rc(params || ({} as T))(this);
    if (typeof obj.id !== "number") {
      throw new Error(`missing id in request ${JSON.stringify(obj)}`);
    }

    let method = obj.method;
    debug("→ %o", method);

    let sentAt = Date.now();
    try {
      const res = await this.transport.post(obj.method, obj.params);
      if (res.error) {
        throw new RequestError(res.error);
      }
      debug("← %o (%oms)", method, Date.now() - sentAt);
      return res.result;
    } catch (err) {
      debug("⇷ %o (%oms): %s", method, Date.now() - sentAt, err.message);
      throw err;
    }
  }

  sendResult<T>(
    cid: number,
    rc: ResultCreator<T>,
    id: number,
    result?: T,
    error?: RpcError,
  ) {
    const obj = rc(id, result, error);
    if (typeof obj.id !== "number") {
      throw new Error(`missing id in result ${JSON.stringify(obj)}`);
    }

    this.transport.post("@Reply", { cid, payload: obj }).catch(e => {
      this.warn(`could not send result for ${obj.id}: ${e.stack}`);
    });
  }

  private async handleMessage(rmJSON: any) {
    let rm: any = JSON.parse(rmJSON);
    if (!rm.cid) {
      throw new Error(`rm missing cid, ignoring`);
    }

    if (!rm.payload) {
      throw new Error(`rm missing payload, ignoring`);
    }

    const { cid, payload } = rm;

    if (typeof payload !== "object") {
      this.sendResult(cid, genericResult, null, null, <RpcError>{
        code: StandardErrorCode.InvalidRequest,
        message: `expected object, got ${typeof payload}`,
      });
      return;
    }

    if (payload.jsonrpc != "2.0") {
      this.sendResult(cid, genericResult, null, null, <RpcError>{
        code: StandardErrorCode.InvalidRequest,
        message: `expected jsonrpc = '2.0', got ${JSON.stringify(
          payload.jsonrpc,
        )}`,
      });
      return;
    }

    if (typeof payload.id !== "number") {
      // we got a notification!
      const handler = this.notificationHandlers[payload.method];
      if (!handler) {
        this.warn(`no handler for notification ${payload.method}`);
        return;
      }

      let retval: any;
      try {
        retval = handler(payload);
      } catch (e) {
        this.warn(`notification handler error: ${e.stack}`);
        if (this.errorHandler) {
          this.errorHandler(e);
        }
      }

      Promise.resolve(retval).catch(e => {
        this.warn(`notification handler async error: ${e.stack}`);
        if (this.errorHandler) {
          this.errorHandler(e);
        }
      });

      return;
    }

    if (payload.method) {
      debug("⇐ %o", payload.method);
      let receivedAt = Date.now();
      const handler = this.requestHandlers[payload.method];
      if (!handler) {
        this.sendResult(cid, genericResult, payload.id, null, <RpcError>{
          code: StandardErrorCode.MethodNotFound,
          message: `no handler is registered for method ${payload.method}`,
        });
        return;
      }

      let retval: any;
      try {
        retval = handler(payload);
      } catch (e) {
        this.sendResult(cid, genericResult, payload.id, null, <RpcError>{
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
        this.sendResult(cid, genericResult, payload.id, result, null);
      } catch (e) {
        this.sendResult(cid, genericResult, payload.id, null, <RpcError>{
          code: StandardErrorCode.InternalError,
          message: `async error: ${e.message}`,
          data: {
            stack: e.stack,
          },
        });
      }

      return;
    }

    this.sendResult(cid, genericResult, payload.id, null, <RpcError>{
      code: StandardErrorCode.InvalidRequest,
      message: "has id but doesn't have method, result, or error",
    });
  }
}
