import { HeaderData } from "@ethereumjs/block";
import { AccessListBuffer } from "@ethereumjs/tx";
import { EVMResult } from "@ethereumjs/vm/dist/evm/evm";
import { RunTxResult } from "@ethereumjs/vm/dist/runTx";
import { bufferToHex } from "ethereumjs-util";

/* eslint-disable @typescript-eslint/naming-convention */

interface GenesisBlock {
  nonce: string;
  timestamp: number;
  extra_data: string;
  gas_limit: string;
  difficulty: string;
  mix_hash: string;
  coinbase: string;
  base_fee_per_gas?: string;
}

interface NetworkConfig {
  chain_id: number;
  genesis_block: GenesisBlock;
}

interface AccountConfig {
  private_key: string;
  initial_balance: string;
}

export interface BuildBlockConfig {
  parent_block_hash: string;
  parent_block_number: number;
  header_data: {
    gas_limit: string;
    coinbase: string;
    nonce: string;
    timestamp: number;
    base_fee_per_gas?: string;
  };
}

interface RethnetBlockHeader {
  parent_hash: string;
  uncle_hash: string;
  coinbase: string;
  state_root: string;
  transactions_trie: string;
  receipt_trie: string;
  logs_bloom: string;
  difficulty: string;
  number: string;
  gas_limit: string;
  gas_used: string;
  timestamp: string;
  extra_data: string;
  mix_hash: string;
  nonce: string;
  base_fee_per_gas?: string;
}

interface RethnetBlock {
  header: RethnetBlockHeader;
  transactions: string[];
  uncle_headers: RethnetBlockHeader[];
}

export function fromRethnetHeader(header: RethnetBlockHeader): HeaderData {
  return {
    parentHash: header.parent_hash,
    uncleHash: header.uncle_hash,
    coinbase: header.coinbase,
    stateRoot: header.state_root,
    transactionsTrie: header.transactions_trie,
    receiptTrie: header.receipt_trie,
    logsBloom: header.logs_bloom,
    difficulty: header.difficulty,
    number: header.number,
    gasLimit: header.gas_limit,
    gasUsed: header.gas_used,
    timestamp: header.timestamp,
    extraData: header.extra_data,
    mixHash: header.mix_hash,
    nonce: header.nonce,
    baseFeePerGas: header.base_fee_per_gas,
    bloom: header.logs_bloom,
  };
}

export function toRethnetAccessList(accessList: AccessListBuffer): AccessList {
  return accessList.map((x) => ({
    address: bufferToHex(x[0]),
    storage_keys: x[1].map(bufferToHex),
  }));
}

interface NetworkContext {
  chain_id: number;
}

interface BlockContext {
  coinbase: string;
  difficulty: string;
  gas_limit: string;
  number: string;
  timestamp: string;

  base_fee_per_gas?: string;

  // RETHNET-TODO: this is very wasteful, and it will be even worse
  // for a forked network
  //
  // instead of this, we should have a sort of "callback" where rethnet
  // can ask hardhat for the hash of a block with a given number
  //
  // since we can't serialize a function, we need to figure out how to
  // do that kind of bi-directional communication
  block_hashes: string[];
}

interface AccessListItem {
  address: string;
  storage_keys: string[];
}

type AccessList = AccessListItem[];

interface TransactionContext {
  origin: string;
  gas_price?: string;
  max_fee_per_gas?: string;
  max_priority_fee_per_gas?: string;
  access_list?: AccessList;
}

interface MessageContext {
  gas_limit: string;
  input: string;
  from: string;
  value: string;
  nonce: string;
}

export interface RethnetVM {
  // create client
  create_client(
    network_config: NetworkConfig,
    accounts_config: AccountConfig[]
  ): Promise<number>; // returns vm_id

  // block builder
  build_block(
    vm_id: number,
    build_block_config: BuildBlockConfig
  ): Promise<number>; // returns block_builder_id

  block_builder_gas_used(
    vm_id: number,
    block_builder_id: number
  ): Promise<string>;

  block_builder_add_transaction(
    vm_id: number,
    block_builder_id: number,
    context: {
      network: NetworkContext;
      transaction: TransactionContext;
      message: MessageContext;
      hardfork: string;
    }
  ): Promise<RunTxResult>;

  block_builder_build(
    vm_id: number,
    block_builder_id: number
  ): Promise<RethnetBlock>;

  block_builder_revert(vm_id: number, block_builder_id: number): Promise<void>;

  // run call
  run_call(
    vm_id: number,
    context: {
      network: NetworkContext;
      block: BlockContext;
      transaction: TransactionContext;
      message: MessageContext;
      hardfork: string;
    }
  ): Promise<EVMResult>;
}

export function getRethnet(): RethnetVM {
  return {
    // create client
    async create_client(
      _network_config: NetworkConfig,
      _accounts_config: AccountConfig[]
    ): Promise<number> {
      return 1;
    },

    // block builder
    async build_block(
      _vm_id: number,
      _build_block_config: BuildBlockConfig
    ): Promise<number> {
      return 1;
    },

    async block_builder_gas_used(
      _vm_id: number,
      _block_builder_id: number
    ): Promise<string> {
      return "0x0";
    },

    async block_builder_add_transaction(
      _vm_id: number,
      _block_builder_id: number,
      _context: {
        network: NetworkContext;
        transaction: TransactionContext;
        message: MessageContext;
        hardfork: string;
      }
    ): Promise<RunTxResult> {
      return null as unknown as RunTxResult;
    },

    async block_builder_build(
      _vm_id: number,
      _block_builder_id: number
    ): Promise<RethnetBlock> {
      return null as unknown as RethnetBlock;
    },

    async block_builder_revert(
      _vm_id: number,
      _block_builder_id: number
    ): Promise<void> {},

    // run tx
    async run_tx(
      _vm_id: number,
      __context: {
        network: NetworkContext;
        block: RethnetBlockHeader;
        transaction: TransactionContext;
        message: MessageContext;
        hardfork: string;
      }
    ): Promise<RunTxResult> {
      return null as unknown as RunTxResult;
    },

    // run call
    async run_call(
      _vm_id: number,
      _context: {
        network: NetworkContext;
        block: BlockContext;
        transaction: TransactionContext;
        message: MessageContext;
        hardfork: string;
      }
    ): Promise<EVMResult> {
      return null as unknown as EVMResult;
    },
  };
}
