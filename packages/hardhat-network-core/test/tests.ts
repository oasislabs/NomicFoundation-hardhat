import { assert } from "chai";

import { addOne } from "../src";

describe("Hardhat Network", function () {
  describe("addOne", function () {
    it("should add 1 test", async function () {
      assert.equal(addOne(-1), 0);
      assert.equal(addOne(0), 1);
      assert.equal(addOne(1), 2);
      assert.equal(addOne(1000), 1001);
    });
  });
});
