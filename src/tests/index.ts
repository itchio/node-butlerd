require("debug").enable("butlerd:*");
import { Instance } from "..";
import * as messages from "./test_messages";
import * as which from "which";
import { IButlerOpts } from "../instance";
import { Client } from "../client";
import { Conversation } from "../conversation";

const inElectron = (process as any).type === "browser";

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
    await testNaive();
    await testCancelConversation();
    await testCancelInstance();
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

async function testCancelInstance() {
  console.log(`Running cancel instance tests`);
  let s = new Instance(butlerOpts());
  const client = new Client(await s.getEndpoint());
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

async function testCancelConversation() {
  console.log(`Running cancel conversation tests...`);
  let s = new Instance(butlerOpts());

  const client = new Client(await s.getEndpoint());

  {
    let callErr: Error;
    try {
      await client.call(messages.TestDoubleTwice, { number: 4 }, conv => {
        conv.on(messages.TestDouble, async params => {
          await new Promise((resolve, reject) => {
            setTimeout(
              () => reject(new Error("TestDouble should not fail this way...")),
              1000,
            );
          });
          return null;
        });
        conv.cancel();
      });
    } catch (e) {
      callErr = e;
    }
    console.log(`Immediate cancellation: `, callErr.stack);
    assertEqual(!!callErr, true, "got error since we cancelled the convo");
    assertEqual(
      callErr.message,
      Conversation.ErrorMessages.Cancelled,
      "has the proper error message",
    );
  }

  {
    let callErr: Error;
    try {
      await client.call(messages.TestDoubleTwice, { number: 4 }, conv => {
        conv.on(messages.TestDouble, async params => {
          await new Promise((resolve, reject) => {
            setTimeout(
              () => reject(new Error("TestDouble should not fail this way...")),
              1000,
            );
          });
          return null;
        });
        setTimeout(() => {
          conv.cancel();
        }, 400);
      });
    } catch (e) {
      callErr = e;
    }
    console.log(`Delayed cancellation: `, callErr.stack);
    assertEqual(!!callErr, true, "got error since we cancelled the convo");
    assertEqual(
      callErr.message,
      Conversation.ErrorMessages.Cancelled,
      "has the proper error message",
    );
  }

  s.cancel();
  await s.promise();
}

async function testNaive() {
  console.log(`Running naive tests...`);
  let s = new Instance(butlerOpts());

  const client = new Client(await s.getEndpoint());

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

  s.cancel();
  await s.promise();
}

function assertEqual(actual: any, expected: any, msg: string) {
  if (actual != expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

process.on("unhandledRejection", e => {
  console.error(`Unhandled rejection: ${e}`);
  process.exit(1);
});

main().catch(e => {
  console.error(`Error in main: `);
  console.error(e.stack);
  process.exit(1);
});
