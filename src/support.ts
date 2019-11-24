import { Client } from "./client";

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

export interface IDGenerator {
  generateID(): number;
}

export interface Endpoint {
  secret: string;
  tcp: {
    address: string;
  };
}

export type Creator<T> = {
  __params?: T;
  __kind?: CreatorKind;
};

export type RequestCreator<T, U> = ((
  params: T,
) => (client: Client) => IRequest<T, U>) &
  Creator<T>;
export type NotificationCreator<T> = ((params: T) => INotification<T>) &
  Creator<T>;

export type ResultCreator<T> = (
  id: number | null,
  result?: T,
  error?: RpcError,
) => IResult<T>;

export enum RequestType {
  Request = 0,
  Notification = 1,
}

export const createRequest = <T, U>(method: string): RequestCreator<T, U> => {
  let rc = ((params: T) => (client: Client) => ({
    jsonrpc: "2.0",
    method,
    id: client.generateID(),
    params,
  })) as RequestCreator<T, U>;
  rc.__kind = CreatorKind.Request;
  return rc;
};

export const createNotification = <T>(
  method: string,
): NotificationCreator<T> => {
  let nc = ((params: T) => ({
    jsonrpc: "2.0",
    method,
    params,
  })) as NotificationCreator<T>;
  nc.__kind = CreatorKind.Notification;
  return nc;
};

export function asRequestCreator<T>(x: Creator<T>): RequestCreator<T, any> {
  if (x.__kind == CreatorKind.Request) {
    return x as RequestCreator<any, any>;
  }
  return null;
}

export function asNotificationCreator<T>(
  x: Creator<T>,
): NotificationCreator<T> {
  if (x.__kind == CreatorKind.Notification) {
    return x as NotificationCreator<any>;
  }
  return null;
}

export const createResult = <T>(): ResultCreator<T> => (
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

export type RequestHandler<T, U> = (payload: IRequest<T, U>) => U | Promise<U>;
export type NotificationHandler<T> = (payload: INotification<T>) => any;
export type ErrorHandler = (e: Error) => void;
export type WarningHandler = (msg: string) => void;
