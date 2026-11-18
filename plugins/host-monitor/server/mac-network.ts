export interface NetworkTotals {
  rx: number;
  tx: number;
}

export interface MacNetworkReading {
  at: number;
  interfaces: Map<string, NetworkTotals>;
}

// Loopback, tunnels and virtual links can count traffic also seen by the host interface.
const IGNORED_INTERFACE = /^(?:lo|utun|tun|tap|gif|stf|ipsec|ppp|bridge|vmenet|vmnet|veth|docker|br-|virbr)/;
const LINK_NETWORK = /^<Link#\d+>$/;

export function parseMacNetwork(output: string): Map<string, NetworkTotals> | null {
  const [heading = "", ...lines] = output.trim().split("\n");
  const columns = heading.trim().split(/\s+/);
  const inputBytes = columns.indexOf("Ibytes");
  const outputBytes = columns.indexOf("Obytes");
  if (columns[0] !== "Name" || columns[2] !== "Network" || columns[3] !== "Address") return null;
  if (inputBytes < 4 || outputBytes <= inputBytes) return null;

  const interfaces = new Map<string, NetworkTotals>();
  for (const line of lines) {
    const fields = line.trim().split(/\s+/);
    const [name = "", , link = ""] = fields;
    if (!LINK_NETWORK.test(link) || name.endsWith("*") || IGNORED_INTERFACE.test(name)) continue;

    // A link without a MAC address leaves its Address field blank.
    const offset = fields.length - columns.length;
    if (offset !== 0 && offset !== -1) return null;
    const rx = readBytes(fields[inputBytes + offset]);
    const tx = readBytes(fields[outputBytes + offset]);
    if (rx === null || tx === null) return null;
    interfaces.set(`${name}:${link}`, { rx, tx });
  }
  return interfaces.size > 0 ? interfaces : null;
}

function readBytes(field: string | undefined): number | null {
  if (field === undefined || !/^\d+$/.test(field)) return null;
  const bytes = Number(field);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

export function summarizeMacNetwork(current: MacNetworkReading, previous: MacNetworkReading | null): {
  totals: NetworkTotals;
  rxBytesPerSec: number;
  txBytesPerSec: number;
} {
  const totals = { rx: 0, tx: 0 };
  let rxDelta = 0;
  let txDelta = 0;
  const seconds = previous ? (current.at - previous.at) / 1000 : 0;
  for (const [link, { rx, tx }] of current.interfaces) {
    totals.rx += rx;
    totals.tx += tx;
    const last = previous?.interfaces.get(link);
    if (last && rx >= last.rx && tx >= last.tx) {
      rxDelta += rx - last.rx;
      txDelta += tx - last.tx;
    }
  }

  return {
    totals,
    rxBytesPerSec: seconds > 0 ? rxDelta / seconds : 0,
    txBytesPerSec: seconds > 0 ? txDelta / seconds : 0,
  };
}
