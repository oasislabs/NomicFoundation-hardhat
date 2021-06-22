import { rpcHash } from "../jsonrpc/types/base-types";
import {
  rpcDebugTracingConfig,
  RpcDebugTracingConfig,
} from "../jsonrpc/types/input/debugTraceTransaction";
import { validateParams } from "../jsonrpc/types/input/validation";
import { MethodNotFoundError } from "../errors";
import { HardhatNode } from "../node";
import { RpcDebugTraceOutput } from "../output";

/* eslint-disable @nomiclabs/only-hardhat-error */

export class DebugModule {
  constructor(private readonly _node: HardhatNode) {}

  public async processRequest(
    method: string,
    params: any[] = []
  ): Promise<any> {
    switch (method) {
      case "debug_traceTransaction":
        return this._traceTransactionAction(
          ...this._traceTransactionParams(params)
        );
    }

    throw new MethodNotFoundError(`Method ${method} not found`);
  }

  // debug_traceTransaction

  private _traceTransactionParams(
    params: any[]
  ): [Buffer, RpcDebugTracingConfig] {
    return validateParams(params, rpcHash, rpcDebugTracingConfig);
  }

  private async _traceTransactionAction(
    hash: Buffer,
    config: RpcDebugTracingConfig
  ): Promise<RpcDebugTraceOutput> {
    return this._node.traceTransaction(hash, config);
  }
}
