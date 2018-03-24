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
}

function sha256Tests() {
  assertEqual(
    sha256("foobar"),
    "c3ab8ff13720e8ad9047dd39466b3c8974e592c2fa383d4a3960714caef0c4f2"
  );
}

async function closeTests() {
  let s = new Instance({
    butlerExecutable: which.sync("butler"),
  });
  const client = await s.makeClient();
  await client.close();
  assertEqual(s.cancelled, false);
  console.log(`Was not cancelled!`);
  assertEqual(s.gracefullyExited, true);
  console.log(`Exited gracefully!`);
}

async function normalTests() {
  let s = new Instance({
    butlerExecutable: which.sync("butler"),
  });

  const client = await s.makeClient();
  await testClient(s, client);
  s.cancel();
  await s.promise();
}

function assertEqual(actual: any, expected: any) {
  if (actual != expected) {
    throw new Error(`expected ${expected}, but got ${actual}`);
  }
}

async function testClient(s: Instance, client: Client) {
  const versionResult = await client.call(messages.VersionGet, {});
  console.log(`<-- Version.Get: ${JSON.stringify(versionResult)}`);

  const input = 256;

  client.on(messages.TestDouble, async ({ number }) => {
    console.log(`<-- Doubling locally!`);
    return { number: number * 2 };
  });

  const dtres = await client.call(messages.TestDoubleTwice, {
    number: input,
  });

  assertEqual(dtres.number, input * 4);
  console.log(`<-- ${input} doubled twice is ${input * 4}, all is well`);

  {
    const c2 = await s.makeClient();

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

    assertEqual(threw, true);
    console.log(`Did throw after close! (c2)`);
  }

  {
    const c3 = await s.makeClient();

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

    assertEqual(threw, true);
    console.log(`Did throw after close! (c3)`);
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
