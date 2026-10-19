import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import { parseArg } from "./invoke.mjs";

const execFileAsync = promisify(execFile);

describe("scripts/invoke.mjs CLI argument validation", () => {
  test("fails with exit code 1 when no arguments or env vars provided", async () => {
    try {
      await execFileAsync("node", ["scripts/invoke.mjs"], {
        env: { ...process.env, INVOKER_SECRET: "", DEPLOYER_SECRET: "" },
      });
      assert.fail("Expected process to exit with non-zero code");
    } catch (err) {
      assert.strictEqual(err.code, 1);
      assert.match(err.stderr, /Usage: INVOKER_SECRET=S/);
    }
  });

  test("fails with exit code 1 when insufficient positional arguments provided", async () => {
    try {
      await execFileAsync("node", ["scripts/invoke.mjs", "SDUMMYSECRET", "C123"], {
        env: { ...process.env, INVOKER_SECRET: "", DEPLOYER_SECRET: "" },
      });
      assert.fail("Expected process to exit with non-zero code");
    } catch (err) {
      assert.strictEqual(err.code, 1);
      assert.match(err.stderr, /Usage/);
    }
  });
});

describe("scripts/invoke.mjs parseArg unit tests", () => {
  test("parses address correctly", () => {
    const validAddress = "GBZXN7PIRZGNMHGA72BLBHNTFAJUR3NGMHHCC5YDHJL3PPCHQSTFU7H6";
    const scVal = parseArg(`address:${validAddress}`);
    assert.ok(scVal);
  });

  test("parses recipients as a vector of address/u32 tuple vectors", () => {
    const address1 = "GBZXN7PIRZGNMHGA72BLBHNTFAJUR3NGMHHCC5YDHJL3PPCHQSTFU7H6";
    const address2 = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
    const recipients = parseArg(`recipients:${address1}=7000,${address2}=3000`).vec();

    assert.equal(recipients.length, 2);
    assert.equal(recipients[0].vec().length, 2);
    assert.ok(
      recipients[0]
        .vec()[0]
        .toXDR()
        .equals(nativeToScVal(new Address(address1), { type: "address" }).toXDR())
    );
    assert.equal(recipients[0].vec()[1].u32(), 7000);
    assert.equal(recipients[1].vec()[1].u32(), 3000);
  });

  test("rejects malformed recipient vectors", () => {
    assert.throws(() => parseArg("recipients:"), /expected address=u32/);
    assert.throws(() => parseArg("recipients:G...=NaN"), /Invalid recipients entry/);
    assert.throws(() => parseArg("recipients:G...=4294967296"), /fit u32/);
  });

  test("parses u32 correctly", () => {
    const scVal = parseArg("u32:250");
    assert.ok(scVal);
  });

  test("parses u64 correctly", () => {
    const scVal = parseArg("u64:1000000");
    assert.ok(scVal);
  });

  test("parses i128 correctly", () => {
    const scVal = parseArg("i128:50000000000");
    assert.ok(scVal);
  });

  test("parses Some(i128) correctly", () => {
    const scVal = parseArg("some-i128:50000000000");
    assert.ok(scVal);
  });

  test("parses bytes32 hex correctly", () => {
    const bytes = "0123456789abcdef".repeat(4);
    const scVal = parseArg(`bytes32:${bytes}`);
    assert.deepEqual(scVal.bytes(), Buffer.from(bytes, "hex"));
  });

  test("rejects bytes32 values that are not exactly 32 bytes", () => {
    assert.throws(() => parseArg("bytes32:abcd"), /exactly 32 bytes/);
  });

  test("parses boolean values and rejects other input", () => {
    assert.equal(parseArg("bool:true").bool(), true);
    assert.equal(parseArg("bool:false").bool(), false);
    assert.throws(() => parseArg("bool:yes"), /Invalid bool argument/);
  });

  test("parses none as a void value", () => {
    const scVal = parseArg("none");
    assert.ok(scVal);
  });

  test("throws error for unknown argument type", () => {
    assert.throws(
      () => parseArg("invalid_type:123"),
      /Unknown arg type: invalid_type/
    );
  });
});
