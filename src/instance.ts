import * as split2 from "split2";
import { spawn, ChildProcess } from "child_process";
import { Endpoint } from "./support";

const debug = require("debug")("butlerd:instance");

export interface IButlerOpts {
  butlerExecutable: string;
  args?: string[];
}

export class Instance {
  process?: ChildProcess;
  _promise: Promise<void>;
  _endpointPromise: Promise<Endpoint>;
  cancelled = false;
  gracefullyExited = false;

  constructor(butlerOpts: IButlerOpts) {
    let onExit = () => {
      this.cancel();
    };
    process.on("exit", onExit);

    let resolveEndpoint: (endpoint: Endpoint) => void;
    let rejectEndpoint: (err: Error) => void;
    this._endpointPromise = new Promise((resolve, reject) => {
      let timeout = setTimeout(() => {
        reject(new Error("timed out waiting for butlerd to listen"));
      }, 5000);

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

      debug(`spawning butler with args ${butlerArgs.join(" ")}...`);

      let { butlerExecutable = "butler" } = butlerOpts;

      this.process = spawn(butlerExecutable, butlerArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let errLines: string[] = [];

      const onClose = (code: number, signal: string) => {
        process.removeListener("exit" as any, onExit);
        debug("butler closed, signal %s, code %d", signal, code);

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

      this.process.on("error", err => {
        debug("butler had error: %s", err.stack || err.message);
        reject(err);
      });

      const processStdoutLine = (line: string) => {
        let data: any;
        try {
          data = JSON.parse(line);
        } catch (e) {
          debug(`[out] ${line}`);
          return;
        }

        switch (data.type) {
          case "butlerd/listen-notification": {
            resolveEndpoint(data);
            break;
          }
          case "log": {
            debug(`[${data.level}] ${data.message}`);
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
        debug(`[err] ${line}`);
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

    this._promise.catch(e => rejectEndpoint(e));
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
