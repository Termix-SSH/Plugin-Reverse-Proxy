import { afterEach, describe, expect, it } from "vitest";
import { renewalDue } from "../../src/backend/certs.js";
import { createRig, type Rig } from "./helpers";

let rig: Rig | null = null;

afterEach(async () => {
  await rig?.close();
  rig = null;
});

const DAY = 24 * 60 * 60 * 1000;

describe("renewalDue", () => {
  it("renews a missing or broken certificate", () => {
    expect(renewalDue(null)).toBe(true);
    expect(renewalDue("not a certificate")).toBe(true);
  });

  it("waits until the last 30 days of a long certificate", async () => {
    rig = await createRig();
    const made = await rig.certs.createSelfSigned("user-1", ["a.test"]);
    const pem = (await rig.repo.getCert(made.id))!.certPem!;
    // A 825 day certificate, so the window is the last 30 days.
    expect(renewalDue(pem)).toBe(false);
    expect(renewalDue(pem, Date.now() + 800 * DAY)).toBe(true);
  });
});
