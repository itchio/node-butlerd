require("debug").enable("butlerd:*");
import { Instance } from "..";
import * as messages from "./test_messages";
import * as which from "which";
import { IButlerOpts } from "../instance";
import { Endpoint } from "../support";
import { Client } from "../client";

interface ClientImpl {
  new (endpoint: Endpoint): Client;
}
let TestedClient: ClientImpl;

const inElectron = (process as any).type === "browser";
if (inElectron) {
  TestedClient = require("../client-electron").Client;
} else {
  TestedClient = require("../client-node").Client;
}

async function main() {
  let exitCode = 0;
  try {
    if (inElectron) {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error("app wasn't ready in 5s, what"));
        }, 5 * 1000);
        require("electron").app.on("ready", resolve);
      });
    }
    await normalTests();
    await cancelTests();
  } catch (e) {
    console.error(e.stack);
    exitCode = 1;
  } finally {
    if (inElectron) {
      require("electron").app.exit(exitCode);
    } else {
      process.exit(exitCode);
    }
  }
}

function butlerOpts(): IButlerOpts {
  return {
    butlerExecutable: which.sync("butler"),
    args: [
      "--dbpath",
      "./tmp/butler.db",
      "--destiny-pid",
      `${process.pid}`,
      "--log",
    ],
  };
}

async function cancelTests() {
  console.log(`Running cancel tests...`);
  let s = new Instance(butlerOpts());
  const client = new TestedClient(await s.getEndpoint());
  await s.cancel();
  let rejected = false;
  console.log(`Firing client.call`);
  client
    .call(messages.VersionGet, {})
    .then(result => {
      console.log(`VersionGet resolved`, result);
    })
    .catch(() => {
      console.log(`VersionGet rejected`);
      rejected = true;
    });
  console.log(`Waiting two seconds...`);
  await new Promise((resolve, reject) => {
    setTimeout(resolve, 2000);
  });
  assertEqual(s.cancelled, true, "instance was cancelled");
  assertEqual(rejected, true, "version.get call was rejected");
}

async function normalTests() {
  console.log(`Running normal tests...`);
  let s = new Instance(butlerOpts());

  const client = new TestedClient(await s.getEndpoint());
  await testClient(client);
  s.cancel();
  await s.promise();
}

function assertEqual(actual: any, expected: any, msg: string) {
  if (actual != expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

async function testClient(client: Client) {
  const versionResult = await client.call(messages.VersionGet, {});
  console.log(`<-- Version.Get: ${JSON.stringify(versionResult)}`);

  const input = 256;

  let numProgress = 0;
  let lastProgress = 0;
  let inOrder = true;
  const dtres = await client.call(
    messages.TestDoubleTwice,
    {
      number: input,
    },
    conv => {
      conv.on(messages.Progress, async progress => {
        console.log(`<(._.)> ${JSON.stringify(progress)}`);
        numProgress++;
        if (progress.progress > lastProgress) {
          console.log(`Getting progress in-order so far...`);
        } else {
          inOrder = false;
        }
      });
      conv.on(messages.TestDouble, async ({ number }) => {
        return { number: number * 2 };
      });
    },
  );

  assertEqual(dtres.number, input * 4, "number was doubled twice");
  assertEqual(numProgress, 3, "received 3 progress notifications");
  assertEqual(inOrder, true, "received progress notifications in order");
}

process.on("unhandledRejection", e => {
  console.error(`Unhandled rejection: ${e.stack}`);
  process.exit(1);
});

main().catch(e => {
  console.error(`Error in main: `);
  console.error(e.stack);
  process.exit(1);
});
