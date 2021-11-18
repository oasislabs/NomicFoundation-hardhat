import path from "path";
import { DefaultStateManager } from "@ethereumjs/vm/dist/state";
import Vm from "@ethereumjs/vm";
import { Account, Address, toBuffer, BN } from "ethereumjs-util";
import Common, { Chain, Hardfork } from "@ethereumjs/common";
import { TransactionFactory } from "@ethereumjs/tx";
import { Block } from "@ethereumjs/block";
import { VMDebugTracer } from "../internal/hardhat-network/stack-traces/vm-debug-tracer";
import { RpcStructLog } from "../internal/hardhat-network/provider/output";
import { Opcode } from "../internal/hardhat-network/stack-traces/opcodes";
import {
  bufferToRpcData,
  numberToRpcQuantity,
} from "../internal/core/jsonrpc/types/base-types";

interface Preconditions {
  [address: string]: {
    balance: string;
    code: string;
    nonce: string;
    storage: {
      [key: string]: string;
    };
  };
}

interface Environment {
  currentBaseFee: string;
  currentCoinbase: string;
  currentDifficulty: string;
  currentNumber: string;
  currentGasLimit: string;
  currentTimestamp: string;
  previousHash: string;
}

interface Tx {
  hash: string;
  indexes: {
    data: number;
    gas: number;
    value: number;
  };
  txbytes: string;
  logs: string;
}

async function runTest(pre: Preconditions, env: Environment, tx: Tx) {
  const stateManager = new DefaultStateManager();
  for (const [addr, account] of Object.entries(pre)) {
    const address = Address.fromString(addr);

    await stateManager.putAccount(
      address,
      Account.fromAccountData({
        nonce: account.nonce,
        balance: account.balance,
      })
    );

    const code = toBuffer(account.code);
    if (code.length > 0) {
      await stateManager.putContractCode(address, code);
    }

    for (const [key, value] of Object.entries(account.storage)) {
      await stateManager.putContractStorage(
        address,
        toBuffer(key),
        toBuffer(value)
      );
    }
  }

  const common = new Common({
    chain: Chain.Mainnet,
    hardfork: Hardfork.Istanbul,
  });
  const vm = new Vm({
    common,
    activatePrecompiles: false,
    hardforkByBlockNumber: false,
    stateManager,
  });

  const transaction = TransactionFactory.fromSerializedData(
    toBuffer(tx.txbytes),
    { common }
  );

  const block = Block.fromBlockData(
    {
      header: {
        number: env.currentNumber,
        // Disabled for now, as we are only using Istanbul
        // baseFeePerGas: env.currentBaseFee,
        coinbase: env.currentCoinbase,
        difficulty: env.currentDifficulty,
        gasLimit: env.currentGasLimit,
        timestamp: env.currentTimestamp,
        parentHash: env.previousHash,
      },
    },
    { common }
  );

  const vmDebugTracer = new VMDebugTracer(vm);
  const trace = await vmDebugTracer.trace(
    async () => {
      await vm.runTx({ tx: transaction, block });
    },
    {
      disableMemory: false,
      disableStack: false,
      disableStorage: false,
    }
  );

  for (const entry of trace.structLogs) {
    console.log(JSON.stringify(formatStructLog(entry)));
  }
}

function formatStructLog(sl: RpcStructLog) {
  return {
    pc: sl.pc,
    op: (Opcode as any)[sl.op],
    gas: numberToRpcQuantity(sl.gas),
    gasCost: numberToRpcQuantity(sl.gasCost),
    memory:
      sl.memory === undefined
        ? "0x"
        : bufferToRpcData(Buffer.from(sl.memory.join(""), "hex")),
    memSize:
      sl.memory?.map((s) => s.length / 2).reduce((n, c) => n + c, 0) ?? 0,
    stack:
      sl.stack?.map((s) =>
        numberToRpcQuantity(new BN(Buffer.from(s, "hex")))
      ) ?? [],
    depth: sl.depth,
    opName: sl.op,
  };
}

async function main(args: string[]) {
  if (
    args.length !== 7 ||
    args[1] !== "-d" ||
    args[3] !== "-g" ||
    args[5] !== "-v"
  ) {
    console.error("This should be run with the following arguments:");
    console.error("<path-to-json> -d <number> -g <number> -v <number>");
    return;
  }

  const testFile = args[0];
  const d = parseInt(args[2], 10);
  const g = parseInt(args[4], 10);
  const v = parseInt(args[6], 10);

  if (!Number.isInteger(d)) {
    console.error("Invalid d");
    return;
  }

  if (!Number.isInteger(g)) {
    console.error("Invalid g");
    return;
  }

  if (!Number.isInteger(v)) {
    console.error("Invalid v");
    return;
  }

  const testJson = Object.values(
    require(path.resolve(process.cwd(), testFile))
  )[0] as any;

  const tx = testJson.post.Istanbul.filter(
    (t: any) =>
      t.indexes.data === d && t.indexes.gas === g && t.indexes.value === v
  )[0];

  await runTest(testJson.pre, testJson.env, tx);
}

main(process.argv.slice(2)).catch(console.error);
