import * as split2 from "split2";
import { spawn, ChildProcess } from "child_process";
import { Client } from "./client";

const debug = require("debug")("buse:instance");

export interface IButlerOpts {
  butlerExecutable: string;
  args?: string[];
}

export type ClientListener = (c: Client) => Promise<void>;

export class Instance {
  process: ChildProcess;
  _promise: Promise<void>;
  cancelled = false;
  client: Client;
  clientListener: ClientListener = (client: Client) => {
    throw new Error("got buse client but no callback was registered to get it");
  };

  constructor(butlerOpts: IButlerOpts) {
    let onExit = () => {
      this.cancel();
    };
    process.on("exit", onExit);

    this._promise = new Promise((resolve, reject) => {
      let butlerArgs = ["--json", "service"];
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

        if (data.type === "result") {
          if (data.value.type === "server-listening") {
            this.client = new Client();
            this.client
              .connect(data.value.address)
              .then(() => {
                // TODO: figure out if we need to handle this.cancelled here
                this.client.onError(e => {
                  reject(
                    new Error(
                      `${e}, butler error log:\n${errLines.join("\n")}`,
                    ),
                  );
                });
                return this.clientListener(this.client);
              })
              .catch(e => reject(e));
            return;
          }
        } else if (debug.enabled && data.type === "log") {
          debug(`[${data.level}] ${data.message}`);
        }
      });

      this.process.stderr.pipe(split2()).on("data", (line: string) => {
        debug(`[err] ${line}`);
        errLines.push(line);
      });
    });
  }

  onClient(cb: ClientListener) {
    this.clientListener = cb;
  }

  cancel() {
    if (this.cancelled) {
      return;
    }

    this.cancelled = true;
    if (this.client) {
      this.client.close();
      this.client = null;
    }

    if (this.process) {
      this.process.kill("SIGINT");
    }
  }

  async promise() {
    await this._promise;
  }
}
