import * as split2 from "split2";
import { spawn, ChildProcess } from "child_process";
import { IEndpoint } from "./client";
const cryptoRandomString = require("crypto-random-string");

const debug = require("debug")("butlerd:instance");

export interface IButlerOpts {
  butlerExecutable: string;
  args?: string[];
}

export class Instance {
  process: ChildProcess;
  _promise: Promise<void>;
  _endpointPromise: Promise<IEndpoint>;
  cancelled = false;
  gracefullyExited = false;
  secret: string;

  constructor(butlerOpts: IButlerOpts) {
    let onExit = () => {
      this.cancel();
    };
    process.on("exit", onExit);

    let resolveEndpoint: (endpoint: IEndpoint) => void;
    this._endpointPromise = new Promise((resolve, reject) => {
      let timeout = setTimeout(() => {
        reject(new Error("timed out waiting for butlerd to listen"));
      }, 5000);

      resolveEndpoint = (endpoint: IEndpoint) => {
        clearTimeout(timeout);
        resolve(endpoint);
      };
    });

    this._promise = new Promise((resolve, reject) => {
      let butlerArgs = ["--json", "daemon"];
      if (debug.enabled) {
        butlerArgs = [...butlerArgs, "--verbose"];
      }
      if (butlerOpts.args) {
        butlerArgs = [...butlerArgs, ...butlerOpts.args];
      }

      debug(`spawning butler with args ${butlerArgs.join(" ")}...`);

      let { butlerExecutable = "butler" } = butlerOpts;

      this.process = spawn(butlerExecutable, butlerArgs, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let errLines = [];

      this.process.on("close", (code: number, signal: string) => {
        process.removeListener("exit", onExit);
        debug("butler closed, signal %s, code %d", signal, code);
        if (signal) {
          if (this.cancelled) {
            resolve();
            return;
          }
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
      });

      this.process.on("error", err => {
        debug("butler had error: %s", err.stack || err.message);
        reject(err);
      });

      this.process.stdout.pipe(split2()).on("data", (line: string) => {
        let data: any;
        try {
          data = JSON.parse(line);
        } catch (e) {
          debug(`[out] ${line}`);
          return;
        }

        switch (data.type) {
          case "butlerd/secret-request": {
            if (!(data.minLength > 0)) {
              reject(
                "internal error: butlerd asked for invalid minimum secret length",
              );
            }

            this.secret = cryptoRandomString(data.minLength);
            const obj = {
              type: "butlerd/secret-result",
              secret: this.secret,
            };
            this.process.stdin.write(JSON.stringify(obj) + "\n", "utf8");
            break;
          }
          case "butlerd/listen-notification": {
            resolveEndpoint({
              secret: this.secret,
              address: data.address,
            });
            break;
          }
          case "log": {
            debug(`[${data.level}] ${data.message}`);
            break;
          }
        }
      });

      this.process.stderr.pipe(split2()).on("data", (line: string) => {
        debug(`[err] ${line}`);
        errLines.push(line);
      });
    });
  }

  async getEndpoint(): Promise<IEndpoint> {
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
