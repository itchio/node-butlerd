import {
  createRequest,
  createNotification,
  IRequest,
  INotification,
  CreatorKind,
} from "../support";
import { Client } from "../client";

/**
 * Params for Connection.New
 */
export interface ConnectionNewParams {
  // no fields
}

/**
 * Result for Connection.New
 */
export interface ConnectionNewResult {
  /** undocumented */
  address: string;
}

/**
 * Ask butler to listen for a new connection, so commands can
 * be sent to it.
 */
export const ConnectionNew = createRequest<
  ConnectionNewParams,
  ConnectionNewResult
>("Connection.New");

/**
 * Params for Version.Get
 */
export interface VersionGetParams {
  // no fields
}

/**
 * Result for Version.Get
 */
export interface VersionGetResult {
  /** Something short, like `v8.0.0` */
  version: string;
  /** Something long, like `v8.0.0, built on Aug 27 2017 @ 01:13:55, ref d833cc0aeea81c236c81dffb27bc18b2b8d8b290` */
  versionString: string;
}

/**
 * Retrieves the version of the butler instance the client
 * is connected to.
 * 
 * This endpoint is meant to gather information when reporting
 * issues, rather than feature sniffing. Conforming clients should
 * automatically download new versions of butler, see the **Updating** section.
 */
export const VersionGet = createRequest<VersionGetParams, VersionGetResult>(
  "Version.Get",
);

/**
 * Params for Test.DoubleTwice
 */
export interface TestDoubleTwiceParams {
  /** The number to quadruple */
  number: number;
}

/**
 * Result for Test.DoubleTwice
 */
export interface TestDoubleTwiceResult {
  /** The input, quadrupled */
  number: number;
}

/**
 * Test request: asks butler to double a number twice.
 * First by calling @@TestDoubleParams, then by
 * returning the result of that call doubled.
 * 
 * Use that to try out your JSON-RPC 2.0 over TCP implementation.
 */
export const TestDoubleTwice = createRequest<
  TestDoubleTwiceParams,
  TestDoubleTwiceResult
>("Test.DoubleTwice");

/**
 * Params for Test.Double
 */
export interface TestDoubleParams {
  /** The number to double */
  number: number;
}

/**
 * Result for Test.Double
 */
export interface TestDoubleResult {
  /** The number, doubled */
  number: number;
}

/**
 * Test request: return a number, doubled. Implement that to
 * use @@TestDoubleTwiceParams in your testing.
 */
export const TestDouble = createRequest<TestDoubleParams, TestDoubleResult>(
  "Test.Double",
);
