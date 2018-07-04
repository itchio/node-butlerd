require("debug").enable("butlerd:*");
import { Instance } from "..";
import { Client } from "../client-node";
import * as messages from "./test_messages";
import * as fs from "fs";
import * as rimraf from "rimraf";
import * as which from "which";
import { newNodeTransport } from "../transport-node";
import { IButlerOpts } from "../instance";

async function main() {
  await normalTests();
  await cancelTests();
}

function butlerOpts(): IButlerOpts {
  return {
    butlerExecutable: which.sync("butler"),
    args: ["--dbpath", "./tmp/butler.db"],
  };
}

async function cancelTests() {
  console.log(`Running cancel tests...`);
  let s = new Instance(butlerOpts());
  const client = new Client(await s.getEndpoint());
  await client.connect();
  s.cancel();
  let rejected = false;
  client
    .call(messages.VersionGet, {})
    .then(() => {})
    .catch(() => {
      rejected = true;
    });
  await new Promise((resolve, reject) => {
    setTimeout(resolve, 1000);
  });
  assertEqual(s.cancelled, true, "instance was cancelled");
  assertEqual(rejected, true, "version.get call was rejected");
}

async function normalTests() {
  console.log(`Running normal tests...`);
  let s = new Instance(butlerOpts());

  const client = new Client(await s.getEndpoint());
  await client.connect();
  await testClient(s, client);
  s.cancel();
  await s.promise();
}

function assertEqual(actual: any, expected: any, msg: string) {
  if (actual != expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

async function testClient(s: Instance, client: Client) {
  const endpoint = await s.getEndpoint();

  const versionResult = await client.call(messages.VersionGet, {});
  console.log(`<-- Version.Get: ${JSON.stringify(versionResult)}`);

  const input = 256;

  client.on(messages.TestDouble, async ({ number }) => {
    return { number: number * 2 };
  });

  const dtres = await client.call(messages.TestDoubleTwice, {
    number: input,
  });

  assertEqual(dtres.number, input * 4, "number was doubled twice");

  {
    const c2 = new Client(endpoint);
    await c2.connect();

    console.log(`Calling VersionGet on c2...`);
    const versionResult = await c2.call(messages.VersionGet, {});
    console.log(`<-- (c2) Version.Get: ${JSON.stringify(versionResult)}`);

    c2.close();

    let threw = false;
    try {
      console.log(`Calling VersionGet on (closed) c2...`);
      await c2.call(messages.VersionGet, {});
    } catch (e) {
      threw = true;
    }

    assertEqual(threw, true, "did throw after close (c2)");
  }

  {
    const c3 = new Client(endpoint);
    await c3.connect();

    console.log(`Calling VersionGet on c3...`);
    const versionResult = await c3.call(messages.VersionGet, {});
    console.log(`<-- (c3) Version.Get: ${JSON.stringify(versionResult)}`);

    await s.cancel();

    let threw = false;
    try {
      console.log(`Calling VersionGet on (closed) c3...`);
      await c3.call(messages.VersionGet, {});
    } catch (e) {
      threw = true;
    }

    assertEqual(threw, true, "did throw after close (c3)");
  }
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
