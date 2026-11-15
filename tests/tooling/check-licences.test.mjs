import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLicences } from "../../scripts/check-licences.mjs";

test("blocks SMPL-family models, Anny's SMPL converters and non-commercial downloads", () => {
  assert.equal(checkLicences("tools/a.py", "import smplx").length, 1);
  assert.equal(checkLicences("tools/a.py", "anny.anny2smpl(body)").length, 1);
  assert.equal(checkLicences("tools/a.py", "paths.download_noncommercial_data()").length, 1);
  assert.equal(checkLicences("tools/requirements.txt", "anny[smpl]==0.6.2").length, 1);
  assert.equal(checkLicences("public/SMPL_NEUTRAL.pkl.json", "").length, 1);
  assert.equal(checkLicences("tools/a.py", "from pifuhd import recon").length, 1);
});

test("blocks ECON, ICON and STAR only as Python imports or packages", () => {
  assert.equal(checkLicences("tools/a.py", "from icon.lib import fit").length, 1);
  assert.equal(checkLicences("tools/requirements.txt", "star==1.0").length, 1);
  assert.equal(checkLicences("src/a.tsx", 'const icon = "star";').length, 0);
});

test("allows Anny and the rest of the allowed stack", () => {
  assert.equal(checkLicences("tools/requirements.txt", "anny==0.6.2\ncma==4.5.0").length, 0);
  assert.equal(checkLicences("tools/a.py", "import anny\nimport torch\nimport cma").length, 0);
});
