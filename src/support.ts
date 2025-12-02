// this file can be imported without pulling in node.js's "net"
// module etc., so it can be used in a browser context for example.

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

export const createResult =
  <T>(): ResultCreator<T> =>
  (id?: number, result?: T, error?: RpcError): RpcResult<T> => {
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

/**
 * A JSON-RPC 2.0 error
 */
export interface RpcError {
  code: number;
  message: string;
  data?: RpcErrorData;
}

/**
 * Additional context provided with an RPC error
 */
export interface RpcErrorData {
  stack?: string;
  butlerVersion?: string;
  apiError?: APIError;
}

/**
 * Represents an itch.io API error
 */
export interface APIError {
  messages?: string[];
  statusCode?: number;
  path?: string;
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

/**
 * A JavaScript Error that encapsulates a JSON-RPC 2.0 Error.
 * @see asRequestError
 * @see getErrorStack
 * @see getRpcErrorData
 */
export class RequestError extends Error {
  rpcError: RpcError;

  constructor(rpcError: RpcError) {
    super(formatRpcError(rpcError));
    this.rpcError = rpcError;
  }

  static fromInternalCode(code: InternalCode): RequestError {
    return new RequestError({
      message: internalCodeToString(code),
      code,
      data: {
        stack: new Error().stack,
      },
    });
  }
}

export enum InternalCode {
  ConversationCancelled = -1000,
  ConnectionTimedOut = -1100,
  SocketClosed = -1200,
}

/**
 * Return a string representation of an internal error code.
 */
export function internalCodeToString(code: InternalCode): string {
  switch (code) {
    case InternalCode.ConversationCancelled:
      return "JSON-RPC conversation cancelled";
    case InternalCode.ConnectionTimedOut:
      return "JSON-RPC connection timed out";
    case InternalCode.SocketClosed:
      return "JSON-RPC socket closed by remote peer";
  }
}

/**
 * Get a RequestError's stack Golang trace or JavaScript
 * stack trace, if any, or message if not.
 */
export function getErrorStack(e: Error): string {
  if (!e) {
    return "Unknown error";
  }

  let errorStack = e.stack || e.message;

  const re = asRequestError(e);
  if (re) {
    const ed = getRpcErrorData(e);
    if (ed && ed.stack) {
      // use golang stack if available
      errorStack = ed.stack;
    } else if (re.message) {
      // or just message
      errorStack = re.message;
    }
  }
  return errorStack;
}

/**
 * Cast an Error to `RequestError`, if it looks like one,
 * otherwise return null
 */
export function asRequestError(e: Error): RequestError | undefined {
  const re = e as RequestError;
  if (re.rpcError) {
    return e as RequestError;
  }
}

/**
 * If this error is a JSON-RPC 2.0 error, return its additional error data,
 * if any
 */
export function getRpcErrorData(e: Error): RpcErrorData | undefined {
  const re = asRequestError(e);
  if (re && re.rpcError) {
    return re.rpcError.data;
  }
}

export type RequestHandler<Params, Result> = (
  params: Params,
) => Promise<Result>;
export type NotificationHandler<Params> = (params: Params) => void;
export type ErrorHandler = (e: Error) => void;
export type WarningHandler = (msg: string) => void;
