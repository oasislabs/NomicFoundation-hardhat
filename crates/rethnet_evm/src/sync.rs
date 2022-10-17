mod client;

use anyhow::anyhow;
use bytes::Bytes;
use primitive_types::{H160, H256};
use revm::opcode;
use revm::BlockEnv;
use revm::CfgEnv;
use revm::EVMData;
use revm::Interpreter;
use revm::Return;
use revm::{AccountInfo, Database, ExecutionResult, Inspector, TxEnv, EVM};
use tokio::sync::{mpsc::UnboundedReceiver, oneshot};

use crate::State;

pub use self::client::Client;

#[derive(Debug)]
pub enum Request {
    AccountByAddress {
        address: H160,
        sender: oneshot::Sender<anyhow::Result<Option<AccountInfo>>>,
    },
    DryRun {
        transaction: TxEnv,
        block: BlockEnv,
        cfg: CfgEnv,
        sender: oneshot::Sender<(ExecutionResult, State)>,
    },
}

pub struct Rethnet<D>
where
    D: Database<Error = anyhow::Error>,
{
    evm: EVM<D>,
    request_receiver: UnboundedReceiver<Request>,
}

impl<D> Rethnet<D>
where
    D: Database<Error = anyhow::Error>,
{
    pub fn new(request_receiver: UnboundedReceiver<Request>, db: D) -> Self {
        let mut evm = EVM::new();
        evm.database(db);

        Self {
            evm,
            request_receiver,
        }
    }

    pub async fn run(request_receiver: UnboundedReceiver<Request>, db: D) -> anyhow::Result<()> {
        let mut rethnet = Rethnet::new(request_receiver, db);

        rethnet.event_loop().await
    }

    async fn event_loop(&mut self) -> anyhow::Result<()> {
        while let Some(request) = self.request_receiver.recv().await {
            let sent_response = match request {
                Request::AccountByAddress { address, sender } => {
                    sender.send(self.evm.db().unwrap().basic(address)).is_ok()
                }
                Request::DryRun {
                    transaction,
                    block,
                    cfg,
                    sender,
                } => {
                    self.evm.env.tx = transaction;
                    self.evm.env.block = block;
                    self.evm.env.cfg = cfg;
                    sender
                        .send(self.evm.inspect(RethnetInspector::new()))
                        .is_ok()
                }
            };

            if !sent_response {
                return Err(anyhow!("Failed to send response"));
            }
        }
        Ok(())
    }
}

struct RethnetInspector {}

impl RethnetInspector {
    pub fn new() -> Self {
        Self {}
    }
}

impl<DB: Database> Inspector<DB> for RethnetInspector {
    fn step(
        &mut self,
        interp: &mut Interpreter,
        _data: &mut EVMData<'_, DB>,
        _is_static: bool,
    ) -> Return {
        let opcode = unsafe { *interp.instruction_pointer };
        let opcode_str = opcode::OPCODE_JUMPMAP[opcode as usize];

        if let Ok(_) = std::env::var("RETHNET_DEBUG") {
            println!("opcode {:?}", opcode_str);
        }

        Return::Continue
    }
}
