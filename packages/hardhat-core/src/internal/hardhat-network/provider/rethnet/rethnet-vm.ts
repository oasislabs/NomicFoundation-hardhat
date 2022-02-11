import { HeaderData } from "@ethereumjs/block";
import { AccessListBuffer } from "@ethereumjs/tx";
import { EVMResult } from "@ethereumjs/vm/dist/evm/evm";
import { RunTxResult } from "@ethereumjs/vm/dist/runTx";
import { bufferToHex } from "ethereumjs-util";

/* eslint-disable @typescript-eslint/naming-convention */

/**
 * All strings are hex-encoded and 0x-prefixed values, unless otherwise
 * specified
 */

interface GenesisBlock {
  // 8 bytes
  nonce: string;
  // number, in seconds
  timestamp: number;
  // <= 32 bytes
  extra_data: string;
  // number
  gas_limit: string;
  // number
  difficulty: string;
  // 32 bytes
  mix_hash: string;
  // address
  coinbase: string;
  // number
  base_fee_per_gas?: string;
}

interface NetworkConfig {
  chain_id: number;
  genesis_block: GenesisBlock;
}

interface AccountConfig {
  // 32 bytes
  private_key: string;
  // number, in wei
  initial_balance: string;
}

export interface BuildBlockConfig {
  // 32 bytes
  parent_block_hash: string;
  // number
  parent_block_number: number;
  header_data: {
    // number
    gas_limit: string;
    // address
    coinbase: string;
    // 8 bytes
    nonce: string;
    // number, in seconds
    timestamp: number;
    // number
    base_fee_per_gas?: string;
  };
}

interface RethnetBlockHeader {
  // 32 bytes
  parent_hash: string;
  // 32 bytes
  uncle_hash: string;
  // address
  coinbase: string;
  // 32 bytes
  state_root: string;
  // 32 bytes
  transactions_trie: string;
  // 32 bytes
  receipt_trie: string;
  // 256 bytes
  logs_bloom: string;
  // number
  difficulty: string;
  // number
  number: string;
  // number
  gas_limit: string;
  // number
  gas_used: string;
  // number, in seconds
  timestamp: string;
  // <= 32 bytes
  extra_data: string;
  // 32 bytes
  mix_hash: string;
  // 8 bytes
  nonce: string;
  // number
  base_fee_per_gas?: string;
}

interface RethnetBlock {
  header: RethnetBlockHeader;
  // 32 bytes each
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
  // address
  coinbase: string;
  // number
  difficulty: string;
  // number
  gas_limit: string;
  // number
  number: string;
  // number, in seconds
  timestamp: string;

  // number
  base_fee_per_gas?: string;

  // RETHNET-TODO: using an array for `block_hash` is very wasteful, and it will
  // be even worse for a forked network
  //
  // instead of this, we should have a sort of "callback" where rethnet
  // can ask hardhat for the hash of a block with a given number
  //
  // since we can't serialize a function, we need to figure out how to
  // do that kind of bi-directional communication

  // 32 bytes each
  block_hashes: string[];
}

interface AccessListItem {
  // address
  address: string;
  // 32 bytes each
  storage_keys: string[];
}

type AccessList = AccessListItem[];

interface TransactionContext {
  // address
  origin: string;
  // number
  gas_price?: string;
  // number
  max_fee_per_gas?: string;
  // number
  max_priority_fee_per_gas?: string;
  access_list?: AccessList;
}

interface MessageContext {
  // number
  gas_limit: string;
  // bytes, arbitrary size
  input: string;
  // address
  from: string;
  // number
  value: string;
  // number
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
