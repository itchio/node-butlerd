import split2 from "split2";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { Endpoint } from "./support";
import createDebug from "debug";

const debug = createDebug("butlerd:instance");

export interface IButlerOpts {
  butlerExecutable: string;
  args?: string[];
  endpointTimeout?: number;
  log?: (msg: string) => void;
}

const DEFAULT_TIMEOUT = 7000; // ms

export class Instance {
  process?: ChildProcess;
  _promise: Promise<void>;
  _endpointPromise: Promise<Endpoint>;
  exiting = false;
  cancelled = false;
  gracefullyExited = false;

  constructor(butlerOpts: IButlerOpts) {
    let log = (msg: string) => {
      debug(msg);
      if (butlerOpts.log) {
        butlerOpts.log(msg);
      }
    };

    let onExit = () => {
      this.exiting = true;
      this.cancel();
    };
    process.on("exit", onExit);

    let resolveEndpoint: (endpoint: Endpoint) => void;
    let rejectEndpoint: (err: Error) => void;
    let endpointTimeout = butlerOpts.endpointTimeout || DEFAULT_TIMEOUT;
    let beforeEndpoint = Date.now();

    this._endpointPromise = new Promise((resolve, reject) => {
      let timeout = setTimeout(() => {
        if (this.process) {
          log(`timed out waiting for endpoint, butler PID ${this.process.pid}`);
        } else {
          log(`timed out waiting for endpoint, butler process not spawned`);
        }
        reject(new Error("timed out waiting for butlerd to listen"));
      }, endpointTimeout);

      rejectEndpoint = reject;
      resolveEndpoint = (endpoint: Endpoint) => {
        clearTimeout(timeout);
        resolve(endpoint);
      };
    });

    this._promise = new Promise((resolve, reject) => {
      let butlerArgs = [
        "--json",
        "daemon",
        "--transport",
        "tcp",
        "--keep-alive",
      ];
      if (debug.enabled) {
        butlerArgs = [...butlerArgs, "--verbose"];
      }
      if (butlerOpts.args) {
        butlerArgs = [...butlerArgs, ...butlerOpts.args];
      }

      log(`spawning butler with args ${butlerArgs.join(" ")}...`);
      let { butlerExecutable } = butlerOpts;
      let exists = false;
      try {
        exists = fs.existsSync(butlerExecutable);
      } catch (_) {
        // ignore
      }
      log(
        `using executable ${butlerExecutable} (${
          exists ? "exists on disk" : "does not exist on disk"
        })`,
      );

      this.process = spawn(butlerExecutable, butlerArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      log(`spawned butler, PID ${this.process!.pid}`);

      let errLines: string[] = [];

      const onClose = (code: number, signal: string) => {
        process.removeListener("exit", onExit);
        log(`butler closed, signal ${signal}, code ${code}`);

        if (this.cancelled) {
          resolve();
          return;
        }

        if (signal) {
          reject(new Error(`Killed by signal ${signal}`));
          return;
        }

        if (code === 0) {
          this.gracefullyExited = true;
          resolve();
          return;
        }
        reject(
          new Error(
            `butler exit code ${code}, error log:\n${errLines.join("\n")}`,
          ),
        );
      };

      this.process.on("close", (code: number, signal: string) => {
        try {
          onClose(code, signal);
        } catch (e) {
          reject(e);
        }
      });

      this.process.on("error", (err) => {
        if (this.exiting) {
          // swallow error if process is quitting anyway
          return;
        }

        log(`butler had error: ${err.stack ? err.stack : String(err)}`);
        reject(err);
      });

      const processStdoutLine = (line: string) => {
        let data: any;
        try {
          data = JSON.parse(line);
        } catch (e) {
          log(`[out] ${line}`);
          return;
        }

        switch (data.type) {
          case "butlerd/listen-notification": {
            let elapsedMs = Date.now() - beforeEndpoint;
            log(`got endpoint, took ${elapsedMs.toFixed()}ms`);
            resolveEndpoint(data);
            break;
          }
          case "log": {
            log(`[${data.level}] ${data.message}`);
            break;
          }
        }
      };

      this.process.stdout!.pipe(split2()).on("data", (line: string) => {
        try {
          processStdoutLine(line);
        } catch (e) {
          reject(e);
        }
      });

      const processStderrLine = (line: string) => {
        log(`[err] ${line}`);
        errLines.push(line);
      };

      this.process.stderr!.pipe(split2()).on("data", (line: string) => {
        try {
          processStderrLine(line);
        } catch (e) {
          reject(e);
        }
      });
    });

    this._promise.catch((e) => rejectEndpoint(e));
  }

  async getEndpoint(): Promise<Endpoint> {
    return await this._endpointPromise;
  }

  cancel(): Promise<void> {
    if (!this.cancelled) {
      this.cancelled = true;

      if (this.process) {
        this.process.kill("SIGINT");
      }
    }
    return this._promise;
  }

  async promise() {
    await this._promise;
  }
}
