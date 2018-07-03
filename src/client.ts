import { Transport } from "./transport";

var debug = require("debug")("butlerd:client");

export enum StandardErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
}

export enum CreatorKind {
  Request = 1,
  Notification = 2,
}

export interface IEndpoint {
  address: string;
  secret: string;
  cert: string;
}

export type ICreator = {
  __kind?: CreatorKind;
};

export type IRequestCreator<T, U> = ((
  params: T,
) => (client: Client) => IRequest<T, U>) &
  ICreator;
export type INotificationCreator<T> = ((params: T) => INotification<T>) &
  ICreator;

export type IResultCreator<T> = (
  id: number | null,
  result?: T,
  error?: RpcError,
) => IResult<T>;

export enum RequestType {
  Request = 0,
  Notification = 1,
}

export const createRequest = <T, U>(method: string): IRequestCreator<T, U> => {
  let rc = ((params: T) => (client: Client) => ({
    jsonrpc: "2.0",
    method,
    id: client.generateID(),
    params,
  })) as IRequestCreator<T, U>;
  rc.__kind = CreatorKind.Request;
  return rc;
};

export const createNotification = <T>(
  method: string,
): INotificationCreator<T> => {
  let nc = ((params: T) => ({
    jsonrpc: "2.0",
    method,
    params,
  })) as INotificationCreator<T>;
  nc.__kind = CreatorKind.Notification;
  return nc;
};

export function asRequestCreator(x: ICreator): IRequestCreator<any, any> {
  if (x.__kind == CreatorKind.Request) {
    return x as IRequestCreator<any, any>;
  }
  return null;
}

export function asNotificationCreator(x: ICreator): INotificationCreator<any> {
  if (x.__kind == CreatorKind.Notification) {
    return x as INotificationCreator<any>;
  }
  return null;
}

export const createResult = <T>(): IResultCreator<T> => (
  id: number | null,
  result?: T,
  error?: RpcError,
) => {
  if (error) {
    return {
      jsonrpc: "2.0",
      error,
      id,
    };
  } else {
    return {
      jsonrpc: "2.0",
      result,
      id,
    };
  }
};

export const genericResult = createResult<void>();

const Handshake = createRequest<{ message: string }, { signature: string }>(
  "Handshake",
);

export interface INotification<T> {
  method: string;
  params?: T;
}

export interface IRequest<T, U> extends INotification<T> {
  id: number;
}

export interface IResult<T> {
  id: number | null;
  result?: T;
  error?: RpcError;
}

export interface RpcError {
  code: number;
  message: string;
  data?: any;
}

function formatRpcError(rpcError: RpcError): string {
  if (rpcError.code === StandardErrorCode.InternalError) {
    // don't prefix internal errors, for readability.
    // if a `RequestError` is caught, it can still be
    // detected by checking `.rpcError`
    return rpcError.message;
  }

  return `JSON-RPC error ${rpcError.code}: ${rpcError.message}`;
}

export class RequestError extends Error {
  rpcError: RpcError;

  constructor(rpcError: RpcError) {
    super(formatRpcError(rpcError));
    this.rpcError = rpcError;
  }
}

interface IResultPromises {
  [key: number]: {
    resolve: (payload: any) => void;
    reject: (e: Error) => void;
  };
}

export type IRequestHandler<T, U> = (payload: IRequest<T, U>) => U | Promise<U>;

interface IRequestHandlers {
  [method: string]: IRequestHandler<any, any>;
}

export type INotificationHandler<T> = (payload: INotification<T>) => any;

interface INotificationHandlers {
  [method: string]: INotificationHandler<any>;
}

export type IErrorHandler = (e: Error) => void;

export type IWarningHandler = (msg: string) => void;

export class Client {
  private resultPromises: IResultPromises = {};
  private requestHandlers: IRequestHandlers = {};
  private notificationHandlers: INotificationHandlers = {};
  private errorHandler: IErrorHandler = null;
  private warningHandler: IWarningHandler = null;
  private endpoint: IEndpoint;
  private clientId: string;
  private transport: Transport;
  idSeed = 0;

  constructor(endpoint: IEndpoint, transport: Transport) {
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
    });

    this.transport.setOnError((e: Error) => {
      this.shutdown(e);
    });

    this.transport.setOnError = (msg: any) => {
      console.log(`Client received message! `, msg);
    };

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

  onError(handler: IErrorHandler) {
    this.errorHandler = handler;
  }

  onWarning(handler: IWarningHandler) {
    this.warningHandler = handler;
  }

  on<T, U>(rc: IRequestCreator<T, U>, handler: (p: T) => Promise<U>);
  on<T>(nc: INotificationCreator<T>, handler: (p: T) => Promise<void>);

  on(c: ICreator, handler: (p: any) => Promise<any>) {
    if (c.__kind === CreatorKind.Request) {
      this.onRequest(
        c as IRequestCreator<any, any>,
        async payload => await handler(payload.params),
      );
    } else if (c.__kind === CreatorKind.Notification) {
      this.onNotification(
        c as INotificationCreator<any>,
        async payload => await handler(payload.params),
      );
    } else {
      throw new Error(`Unknown creator passed (not request nor notification)`);
    }
  }

  onRequest<T, U>(rc: IRequestCreator<T, U>, handler: IRequestHandler<T, U>) {
    const sample = rc(null)(this);
    const { method } = sample;

    if (this.requestHandlers[method]) {
      throw new Error(`cannot register a second request handler for ${method}`);
    }
    this.requestHandlers[method] = handler;
  }

  onNotification<T>(
    nc: INotificationCreator<T>,
    handler: INotificationHandler<T>,
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

  notify<T>(nc: INotificationCreator<T>, params?: T) {
    const obj = nc(params);
  }

  async call<T, U>(rc: IRequestCreator<T, U>, params: T): Promise<U> {
    const obj = rc(params || ({} as T))(this);
    if (typeof obj.id !== "number") {
      throw new Error(`missing id in request ${JSON.stringify(obj)}`);
    }

    let method = obj.method;
    debug("→ %o", method);

    return new Promise<U>((resolve, reject) => {
      this.resultPromises[obj.id] = {
        resolve: x => {
          debug("← %o (%oms)", method, Date.now() - sentAt);
          resolve(x);
        },
        reject: e => {
          debug("⇷ %o (%oms): %s", method, Date.now() - sentAt, e.message);
          reject(e);
        },
      };

      let sentAt = Date.now();
      this.sendRaw(obj).catch(e => {
        debug("⇷ %o (%oms): %s", method, Date.now() - sentAt, e.message);
        reject(e);
      });
    });
  }

  sendResult<T>(
    rc: IResultCreator<T>,
    id: number,
    result?: T,
    error?: RpcError,
  ): Promise<void> {
    const obj = rc(id, result, error);
    if (typeof obj.id !== "number") {
      throw new Error(`missing id in result ${JSON.stringify(obj)}`);
    }

    if (this.transport.isClosed()) {
      // just ignore
      return;
    }

    this.sendRaw(obj).catch(e => {
      this.warn(`could not send result for ${obj.id}: ${e.stack}`);
    });
  }

  private async sendRaw(obj: any) {
    if (this.transport.isClosed()) {
      throw new Error(`trying to send on disconnected client`);
    }

    const type = typeof obj;
    if (type !== "object") {
      throw new Error(
        `can only send object via json-rpc, refusing to send ${type}`,
      );
    }

    if (obj.jsonrpc != "2.0") {
      throw new Error(
        `expected message.jsonrpc == '2.0', got ${JSON.stringify(obj.jsonrpc)}`,
      );
    }

    const payload = JSON.stringify(obj);
    await this.transport.post(obj);
  }

  private onReceiveRaw(line: string) {
    let obj: any;

    try {
      obj = JSON.parse(line);
    } catch (e) {
      this.sendResult(genericResult, null, null, <RpcError>{
        code: StandardErrorCode.ParseError,
        message: e.message,
      });
      return;
    }

    if (typeof obj !== "object") {
      this.sendResult(genericResult, null, null, <RpcError>{
        code: StandardErrorCode.InvalidRequest,
        message: `expected object, got ${typeof obj}`,
      });
      return;
    }

    if (obj.jsonrpc != "2.0") {
      this.sendResult(genericResult, null, null, <RpcError>{
        code: StandardErrorCode.InvalidRequest,
        message: `expected jsonrpc = '2.0', got ${JSON.stringify(obj.jsonrpc)}`,
      });
      return;
    }

    if (typeof obj.id !== "number") {
      // we got a notification!
      const handler = this.notificationHandlers[obj.method];
      if (!handler) {
        this.warn(`no handler for notification ${obj.method}`);
        return;
      }

      let retval: any;
      try {
        retval = handler(obj);
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

    if (obj.method) {
      let doLog = obj.method !== "Handshake";
      if (doLog) {
        debug("⇐ %o", obj.method);
      }
      let receivedAt = Date.now();
      const handler = this.requestHandlers[obj.method];
      if (!handler) {
        this.sendResult(genericResult, obj.id, null, <RpcError>{
          code: StandardErrorCode.MethodNotFound,
          message: `no handler is registered for method ${obj.method}`,
        });
        return;
      }

      let retval: any;
      try {
        retval = handler(obj);
      } catch (e) {
        this.sendResult(genericResult, obj.id, null, <RpcError>{
          code: StandardErrorCode.InternalError,
          message: `sync error: ${e.message}`,
          data: {
            stack: e.stack,
          },
        });
        return;
      }

      Promise.resolve(retval)
        .then(result => {
          if (doLog) {
            debug("⇒ %o (%oms)", obj.method, Date.now() - receivedAt);
          }
          this.sendResult(genericResult, obj.id, result, null);
        })
        .catch(e => {
          this.sendResult(genericResult, obj.id, null, <RpcError>{
            code: StandardErrorCode.InternalError,
            message: `async error: ${e.message}`,
            data: {
              stack: e.stack,
            },
          });
        });
      return;
    }

    if (obj.result) {
      const promise = this.resultPromises[obj.id];
      if (!promise) {
        this.warn(`dropped result: ${JSON.stringify(obj.result)}`);
        return;
      }

      delete this.resultPromises[obj.id];
      promise.resolve(obj.result);
      return;
    }

    if (obj.error) {
      const promise = this.resultPromises[obj.id];
      if (!promise) {
        this.warn(`dropped error: ${JSON.stringify(obj.result)}`);
        return;
      }

      delete this.resultPromises[obj.id];
      promise.reject(new RequestError(obj.error));
      return;
    }

    this.sendResult(genericResult, obj.id, null, <RpcError>{
      code: StandardErrorCode.InvalidRequest,
      message: "has id but doesn't have method, result, or error",
    });
  }
}
