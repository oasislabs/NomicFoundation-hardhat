use primitive_types::H160;
use revm::{AccountInfo, BlockEnv, CfgEnv, Database, ExecutionResult, TxEnv};
use tokio::sync::{
    mpsc::{unbounded_channel, UnboundedSender},
    oneshot,
};

use crate::State;

use super::{Request, Rethnet};

pub struct Client {
    request_sender: UnboundedSender<Request>,
}

impl Client {
    /// Constructs a `Rethnet` client with the provided database.
    pub fn with_db<D>(db: D) -> Self
    where
        D: Database<Error = anyhow::Error> + Send + 'static,
    {
        let (request_sender, request_receiver) = unbounded_channel();

        tokio::spawn(Rethnet::run(request_receiver, db));

        Self { request_sender }
    }

    /// Runs a transaction with committing the state.
    pub async fn dry_run(
        &self,
        transaction: TxEnv,
        block: BlockEnv,
        cfg: CfgEnv,
    ) -> (ExecutionResult, State) {
        let (sender, receiver) = oneshot::channel();

        self.request_sender
            .send(Request::DryRun {
                transaction,
                block,
                sender,
                cfg,
            })
            .expect("Failed to send request");

        receiver.await.expect("Rethnet unexpectedly crashed")
    }

    /// Retrieves the account corresponding to the address, if it exists.
    pub async fn get_account_by_address(
        &self,
        address: H160,
    ) -> anyhow::Result<Option<AccountInfo>> {
        let (sender, receiver) = oneshot::channel();

        self.request_sender
            .send(Request::AccountByAddress { address, sender })
            .expect("Failed to send request");

        receiver.await.expect("Rethnet unexpectedly crashed")
    }
}
