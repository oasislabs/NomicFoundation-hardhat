use napi::bindgen_prelude::Buffer;
use std::sync::mpsc::{channel, Sender};

use anyhow::anyhow;
use napi::Status;
use rethnet_evm::{
    AccountInfo, Bytecode, Database, DatabaseCommit, DatabaseDebug, H160, H256, U256,
};

use crate::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};

pub struct CommitCall {
    pub sender: Sender<napi::Result<()>>,
}

pub struct GetAccountByAddressCall {
    pub address: H160,
    pub sender: Sender<napi::Result<AccountInfo>>,
}

pub struct GetAccountStorageSlotCall {
    pub address: H160,
    pub index: U256,
    pub sender: Sender<napi::Result<U256>>,
}

pub struct GetStorageRootCall {
    pub sender: Sender<napi::Result<H256>>,
}

pub struct GetCodeByCodeHashCall {
    pub sender: Sender<napi::Result<Bytecode>>,
    pub code_hash: H256,
}

pub struct GetBlockHashByBlockNumber {
    pub block_number: U256,
    pub sender: Sender<napi::Result<H256>>,
}

pub struct InsertAccountCall {
    pub address: H160,
    pub account_info: AccountInfo,
    pub sender: Sender<napi::Result<()>>,
}

pub struct SetAccountBalanceCall {
    pub address: H160,
    pub balance: U256,
    pub sender: Sender<napi::Result<()>>,
}

pub struct SetAccountCodeCall {
    pub address: H160,
    pub code: Bytecode,
    pub sender: Sender<napi::Result<()>>,
}

pub struct SetAccountNonceCall {
    pub address: H160,
    pub nonce: u64,
    pub sender: Sender<napi::Result<()>>,
}

pub struct SetAccountStorageSlotCall {
    pub address: H160,
    pub index: U256,
    pub value: U256,
    pub sender: Sender<napi::Result<()>>,
}

pub struct CheckpointCall {
    pub sender: Sender<napi::Result<()>>,
}

pub struct RevertCall {
    pub sender: Sender<napi::Result<()>>,
}

pub struct CallbackDatabase {
    get_account_by_address_fn: ThreadsafeFunction<GetAccountByAddressCall>,
    get_account_storage_slot_fn: ThreadsafeFunction<GetAccountStorageSlotCall>,
    get_storage_root_fn: ThreadsafeFunction<GetStorageRootCall>,
    get_code_by_code_hash_fn: ThreadsafeFunction<GetCodeByCodeHashCall>,
    get_block_hash_by_block_number_fn: ThreadsafeFunction<GetBlockHashByBlockNumber>,
}

impl CallbackDatabase {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        get_account_by_address_fn: ThreadsafeFunction<GetAccountByAddressCall>,
        get_account_storage_slot_fn: ThreadsafeFunction<GetAccountStorageSlotCall>,
        get_storage_root: ThreadsafeFunction<GetStorageRootCall>,
        get_code_by_code_hash_fn: ThreadsafeFunction<GetCodeByCodeHashCall>,
        get_block_hash_by_block_number_fn: ThreadsafeFunction<GetBlockHashByBlockNumber>,
    ) -> Self {
        Self {
            get_account_by_address_fn,
            get_account_storage_slot_fn,
            get_storage_root_fn: get_storage_root,
            get_code_by_code_hash_fn,
            get_block_hash_by_block_number_fn,
        }
    }
}

impl Database for CallbackDatabase {
    type Error = anyhow::Error;

    fn basic(&mut self, address: H160) -> anyhow::Result<Option<AccountInfo>> {
        let (sender, receiver) = channel();

        let status = self.get_account_by_address_fn.call(
            GetAccountByAddressCall { address, sender },
            ThreadsafeFunctionCallMode::Blocking,
        );
        assert_eq!(status, Status::Ok);

        receiver.recv().unwrap().map_or_else(
            |e| Err(anyhow!(e.to_string())),
            |account_info| Ok(Some(account_info)),
        )
    }

    fn code_by_hash(&mut self, code_hash: H256) -> anyhow::Result<Bytecode> {
        let (sender, receiver) = channel();

        let status = self.get_code_by_code_hash_fn.call(
            GetCodeByCodeHashCall { sender, code_hash },
            ThreadsafeFunctionCallMode::Blocking,
        );
        assert_eq!(status, Status::Ok);

        receiver.recv().unwrap().map_err(|e| anyhow!(e.to_string()))
    }

    fn storage(&mut self, address: H160, index: U256) -> anyhow::Result<U256> {
        let (sender, receiver) = channel();

        let status = self.get_account_storage_slot_fn.call(
            GetAccountStorageSlotCall {
                address,
                index,
                sender,
            },
            ThreadsafeFunctionCallMode::Blocking,
        );
        assert_eq!(status, Status::Ok);

        receiver.recv().unwrap().map_err(|e| anyhow!(e.to_string()))
    }

    fn block_hash(&mut self, block_number: U256) -> anyhow::Result<H256> {
        let (sender, receiver) = channel();

        let status = self.get_block_hash_by_block_number_fn.call(
            GetBlockHashByBlockNumber {
                block_number,
                sender,
            },
            ThreadsafeFunctionCallMode::Blocking,
        );
        assert_eq!(status, Status::Ok);

        receiver.recv().unwrap().map_err(|e| anyhow!(e.to_string()))
    }
}
