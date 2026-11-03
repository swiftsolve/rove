//! Windows's source for [`crate::apps`] and [`crate::apps::hosts`]: the
//! in-process ETW session in [`super::etw`]. Starting it needs administrator
//! rights, so support is a runtime check.
use super::etw;
use super::hosts::PeerReading;
use super::Support;
use super::{CounterSemantics, UsageUnit};

pub(super) const SEMANTICS: CounterSemantics = CounterSemantics::PidAccumulator;

pub(super) fn support() -> Support {
    if etw::is_active() {
        Support::Supported
    } else {
        Support::Unsupported
    }
}

/// The last ETW start error; `None` once it's running.
pub(super) fn support_detail() -> Option<String> {
    etw::last_error()
}

/// An in-process read of the ETW accumulator: synchronous, and it can't fail.
pub(super) async fn sample_units() -> Option<Vec<UsageUnit>> {
    Some(etw::sample_units())
}

/// The same session's per-connection accumulator, for the Hosts view.
pub(super) async fn sample_peers() -> Option<Vec<PeerReading>> {
    Some(
        etw::sample_peer_units()
            .into_iter()
            .map(|u| PeerReading {
                conn_key: u.conn_key,
                app: u.name,
                ip: u.ip,
                port: u.port,
                rx: u.rx,
                tx: u.tx,
                pid: Some(u.pid),
            })
            .collect(),
    )
}
