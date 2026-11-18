import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMacNetwork, summarizeMacNetwork } from "../server/mac-network.ts";

const heading = "Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll";

test("counts link rows with and without a MAC address and ignores mirrored traffic", () => {
  const interfaces = parseMacNetwork(`${heading}
en0 1500 <Link#4> 02:00:00:00:00:01 12 0 20000 4 0 30000 0
en0 1500 192.0.2 192.0.2.1 12 - 20000 4 - 30000 -
en0 1500 fe80::%en0 fe80::1%en0 12 - 20000 4 - 30000 -
en1 1500 <Link#5> 8 1 340 4 0 900 0
lo0 16384 <Link#1> 10 0 400000 10 0 400000 0
en2* 1500 <Link#6> 10 0 400000 10 0 400000 0
utun0 1500 <Link#7> 10 0 400000 10 0 400000 0
bridge0 1500 <Link#8> 10 0 400000 10 0 400000 0
`);

  assert.deepEqual(interfaces, new Map([
    ["en0:<Link#4>", { rx: 20000, tx: 30000 }],
    ["en1:<Link#5>", { rx: 340, tx: 900 }],
  ]));
});

test("uses the named byte columns when the output includes a trailing drop column", () => {
  const interfaces = parseMacNetwork(`${heading} Drop\nen0 1500 <Link#4> 12 0 20000 4 0 30000 0 7`);
  assert.deepEqual(interfaces?.get("en0:<Link#4>"), { rx: 20000, tx: 30000 });
});

test("reports unavailable data for empty, malformed or unsupported output", () => {
  for (const output of [
    "",
    "netstat: unavailable",
    heading,
    `${heading}\nen0* 1500 <Link#4> 12 0 20000 4 0 30000 0`,
    `${heading}\nen0 1500 <Link#4> 12 0 NaN 4 0 30000 0`,
    `${heading}\nen0 1500 <Link#4> 12 0 -1 4 0 30000 0`,
    `${heading}\nen0 1500 <Link#4> 12 0 9007199254740992 4 0 30000 0`,
    `${heading}\nen0 1500 <Link#4> 20000 30000`,
  ]) {
    assert.equal(parseMacNetwork(output), null);
  }
});

function reading(at, interfaces) {
  return { at, interfaces: new Map(Object.entries(interfaces)) };
}

test("uses elapsed seconds and rebaselines reset, new, missing and recreated links", () => {
  const previous = reading(1500, {
    "en0:<Link#4>": { rx: 100, tx: 200 },
    "en1:<Link#5>": { rx: 900, tx: 900 },
    "en2:<Link#6>": { rx: 100, tx: 100 },
    "en3:<Link#7>": { rx: 20, tx: 20 },
  });
  const current = reading(4000, {
    "en0:<Link#4>": { rx: 350, tx: 700 },
    "en1:<Link#5>": { rx: 10, tx: 1000 },
    "en3:<Link#8>": { rx: 500, tx: 600 },
    "en4:<Link#9>": { rx: 1000, tx: 1000 },
  });

  assert.deepEqual(summarizeMacNetwork(current, previous), {
    totals: { rx: 1860, tx: 3300 },
    rxBytesPerSec: 100,
    txBytesPerSec: 200,
  });
  assert.equal(summarizeMacNetwork(previous, current).rxBytesPerSec, 0);
  assert.equal(summarizeMacNetwork(current, current).txBytesPerSec, 0);
  assert.deepEqual(summarizeMacNetwork(current, null), {
    totals: { rx: 1860, tx: 3300 },
    rxBytesPerSec: 0,
    txBytesPerSec: 0,
  });

  const next = reading(4500, {
    "en1:<Link#5>": { rx: 20, tx: 1040 },
    "en2:<Link#6>": { rx: 1000, tx: 1000 },
  });
  assert.deepEqual(summarizeMacNetwork(next, current), {
    totals: { rx: 1020, tx: 2040 },
    rxBytesPerSec: 20,
    txBytesPerSec: 80,
  });
});
