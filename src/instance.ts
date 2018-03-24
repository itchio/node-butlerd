import * as split2 from "split2";
import { spawn, ChildProcess } from "child_process";
import { Client } from "./client";
const uuidv4 = require("uuid/v4");

const debug = require("debug")("buse:instance");

export interface IButlerOpts {
  butlerExecutable: string;
  args?: string[];
}

export type ClientListener = (c: Client) => Promise<void>;

export class Instance {
  process: ChildProcess;
  _promise: Promise<void>;
  _addressPromise: Promise<string>;
  cancelled = false;
  gracefullyExited = false;
  secret: string;

  constructor(butlerOpts: IButlerOpts) {
    this.secret = "";
    for (let i = 0; i < 16; i++) {
      this.secret += uuidv4();
    }

    let onExit = () => {
      this.cancel();
    };
    process.on("exit", onExit);

    let resolveAddress: (address: string) => void;
    this._addressPromise = new Promise((resolve, reject) => {
      let timeout = setTimeout(() => {
        reject(new Error("timed out waiting for buse to listen"));
      }, 5000);

      resolveAddress = (address: string) => {
        clearTimeout(timeout);
        resolve(address);
      };
    });

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
            `butler exit code ${code}, error log:\n${errLines.join("\n")}`
          )
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
            resolveAddress(data.value.address);
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

      this.process.stdin.write(
        JSON.stringify({ secret: this.secret }) + "\n",
        "utf8"
      );
    });
  }

  async makeClient(): Promise<Client> {
    return new Promise<Client>((resolve, reject) => {
      this._promise.catch(e => reject(e));
      this._promise.then(() => reject(new Error("buse was terminated")));
      var client = new Client(this.secret);
      client.setParentPromise(this._promise);
      this._addressPromise
        .then(address => client.connect(address))
        .then(() => resolve(client))
        .catch(reject);
    });
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
