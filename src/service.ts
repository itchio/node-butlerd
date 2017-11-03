import * as split2 from "split2";
import { spawn, ChildProcess } from "child_process";
import { Client } from "./client";

const debug = require("debug")("butler:service");

export interface IButlerOpts {}

export type ClientListener = (c: Client) => void;

export class Service {
  process: ChildProcess;
  _promise: Promise<any>;
  cancelled = false;
  client: Client;
  clientListener: ClientListener = (client: Client) => {
    throw new Error("got buse client but no callback was registered to get it");
  };

  constructor(butlerOpts: IButlerOpts = {}) {
    this._promise = new Promise((resolve, reject) => {
      debug("spawning butler...");
      this.process = spawn("butler", ["--json", "service"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.process.on("close", (code: number, signal: string) => {
        debug("butler closed, signal %s, code %d", signal, code);
        if (signal) {
          if (this.cancelled) {
            resolve(0);
            return;
          }
          reject(`Killed by signal ${signal}`);
          return;
        }

        resolve(code);
      });

      this.process.on("error", err => {
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
                this.clientListener(this.client);
              })
              .catch(reject);
          }
        }
      });

      this.process.stderr.pipe(split2()).on("data", (line: string) => {
        debug(`[err] ${line}`);
      });
    });
  }

  onClient(cb: ClientListener) {
    this.clientListener = cb;
  }

  cancel() {
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
