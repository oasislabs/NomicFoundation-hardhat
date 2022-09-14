use napi::{
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    Status,
};
use rethnet_evm::{
    AccountInfo, Bytecode, Database, DatabaseCommit, DatabaseDebug, H160, H256, U256,
};

pub struct CallbackDatabase {
    get_account_by_address_fn: ThreadsafeFunction<H160, ErrorStrategy::Fatal>,
    insert_account_fn: ThreadsafeFunction<(H160, AccountInfo), ErrorStrategy::Fatal>,
}

impl CallbackDatabase {
    pub fn new(
        get_account_by_address_fn: ThreadsafeFunction<H160, ErrorStrategy::Fatal>,
        insert_account_fn: ThreadsafeFunction<(H160, AccountInfo), ErrorStrategy::Fatal>,
    ) -> Self {
        Self {
            get_account_by_address_fn,
            insert_account_fn,
        }
    }
}

impl Database for CallbackDatabase {
    type Error = anyhow::Error;

    fn basic(&mut self, address: H160) -> anyhow::Result<Option<AccountInfo>> {
        let status = self
            .get_account_by_address_fn
            .call(address, ThreadsafeFunctionCallMode::Blocking);
        assert_eq!(status, Status::Ok);

        Ok(Some(AccountInfo::default()))
    }

    fn code_by_hash(&mut self, code_hash: H256) -> anyhow::Result<Bytecode> {
        todo!()
    }

    fn storage(&mut self, address: H160, index: U256) -> anyhow::Result<U256> {
        todo!()
    }

    fn block_hash(&mut self, number: U256) -> anyhow::Result<H256> {
        todo!()
    }
}

impl DatabaseCommit for CallbackDatabase {
    fn commit(&mut self, changes: rethnet_evm::HashMap<H160, rethnet_evm::Account>) {
        todo!()
    }
}

impl DatabaseDebug for CallbackDatabase {
    fn storage_root(&mut self) -> H256 {
        todo!()
    }

    fn account_info_mut(&mut self, address: &H160) -> &mut AccountInfo {
        todo!()
    }

    fn insert_account(&mut self, address: &H160, account_info: AccountInfo) {
        let status = self.insert_account_fn.call(
            (address.clone(), account_info),
            ThreadsafeFunctionCallMode::Blocking,
        );
        assert_eq!(status, Status::Ok);
    }

    fn insert_block(&mut self, block_number: U256, block_hash: H256) {
        todo!()
    }

    fn set_storage_slot_at_layer(&mut self, address: H160, index: U256, value: U256) {
        todo!()
    }
}
