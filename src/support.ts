export enum StandardErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
}

export interface IDGenerator {
  generateID(): number;
}

export interface Endpoint {
  secret: string;
  tcp: {
    address: string;
  };
}

export interface RequestCreator<Params, Result> {
  (params: Params): (gen: IDGenerator) => Request<Params, Result>;
  __method: string;
  __params?: Params;
  __result?: Params;
}

export interface NotificationCreator<Params> {
  (params: Params): Notification<Params>;
  __method: string;
  __params?: Params;
}

export type ResultCreator<T> = (
  id?: number,
  result?: T,
  error?: RpcError,
) => RpcResult<T>;

export enum RequestType {
  Request = 0,
  Notification = 1,
}

export const createRequest = <Params, Result>(
  method: string,
): RequestCreator<Params, Result> => {
  return Object.assign(
    (params: Params) => (gen: IDGenerator) => ({
      jsonrpc: "2.0",
      method,
      id: gen.generateID(),
      params,
    }),
    { __method: method },
  );
};

export const createNotification = <Params>(
  method: string,
): NotificationCreator<Params> => {
  return Object.assign(
    (params: Params) => ({
      jsonrpc: "2.0",
      method,
      params,
    }),
    { __method: method },
  ) as NotificationCreator<Params>;
};

export const createResult = <T>(): ResultCreator<T> => (
  id?: number,
  result?: T,
  error?: RpcError,
): RpcResult<T> => {
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

export interface Notification<T> {
  method: string;
  params: T;
}

export interface Request<T, U> extends Notification<T> {
  id: number;
}

export interface RpcResult<T> {
  jsonrpc: "2.0";
  id?: number;
  result?: T;
  error?: RpcError;
}

export interface RpcError {
  code: number;
  message: string;
  data?: any;
}

export interface RpcMessage {
  id: number;
  jsonrpc: string;

  // call only
  method: string;
  params: any;

  // response only
  error: RpcError;
  result: any;
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

export type RequestHandler<Params, Result> = (
  params: Params,
) => Promise<Result>;
export type NotificationHandler<Params> = (params: Params) => void;
export type ErrorHandler = (e: Error) => void;
export type WarningHandler = (msg: string) => void;
