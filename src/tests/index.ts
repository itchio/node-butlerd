require("debug").enable("buse:*");
import { Instance, Client } from "..";
import { sha256 } from "../sha256";
import * as messages from "./test_messages";
import * as fs from "fs";
import * as rimraf from "rimraf";
import * as which from "which";

async function main() {
  sha256Tests();
  await normalTests();
  await closeTests();
  await cancelTests();
}

function sha256Tests() {
  assertEqual(
    sha256("foobar"),
    "c3ab8ff13720e8ad9047dd39466b3c8974e592c2fa383d4a3960714caef0c4f2",
    "sha256 hash is computed"
  );
}

async function closeTests() {
  let s = new Instance({
    butlerExecutable: which.sync("butler"),
  });
  const client = new Client(await s.getEndpoint());
  await client.connect();
  client.close();
  await s.promise();
  assertEqual(s.cancelled, false, "instance was not cancelled");
  assertEqual(s.gracefullyExited, true, "instance gracefully exited");
}

async function cancelTests() {
  let s = new Instance({
    butlerExecutable: which.sync("butler"),
  });
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
  let s = new Instance({
    butlerExecutable: which.sync("butler"),
  });

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
