import { hexlify } from "@ethersproject/bytes";

import { MethodNotFoundError } from "../../../core/providers/errors";
import { HardhatNode } from "../node";

/* eslint-disable @nomiclabs/hardhat-internal-rules/only-hardhat-error */

export class OasisModule {
  constructor(private readonly _node: HardhatNode) {}

  public async processRequest(
    method: string,
    _params: any[] = []
  ): Promise<any> {
    switch (method) {
      case "oasis_callDataPublicKey": {
        const publicKey = this._node.getPublicKey();
        return { key: hexlify(publicKey) };
      }
    }

    throw new MethodNotFoundError(`Method ${method} not found`);
  }
}
