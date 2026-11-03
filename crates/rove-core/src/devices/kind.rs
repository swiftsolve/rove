//! What a LAN device is: the category the classifier settles on, the Devices
//! view's icon and label, and the `kind` column in the store. Mirrors
//! `LanDeviceKind` in `src/types/devices.ts`; serde and SQLite both carry it as
//! the lowercase slug (`"router"`, `"iot"`).

use rusqlite::types::{FromSql, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use serde::Serialize;

/// Declared most specific first, so a full tie in the classifier's tally
/// resolves toward the narrower kind: nas over computer, camera or speaker over
/// iot, console over tv. `Unknown` is last and never voted for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceKind {
    Router,
    Nas,
    Computer,
    Tablet,
    Watch,
    Phone,
    Console,
    Tv,
    Printer,
    Camera,
    Speaker,
    Iot,
    Unknown,
}

impl DeviceKind {
    /// Every kind the classifier can vote for, in tie-break order.
    pub const VOTABLE: [Self; 12] = [
        Self::Router,
        Self::Nas,
        Self::Computer,
        Self::Tablet,
        Self::Watch,
        Self::Phone,
        Self::Console,
        Self::Tv,
        Self::Printer,
        Self::Camera,
        Self::Speaker,
        Self::Iot,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Router => "router",
            Self::Nas => "nas",
            Self::Computer => "computer",
            Self::Tablet => "tablet",
            Self::Watch => "watch",
            Self::Phone => "phone",
            Self::Console => "console",
            Self::Tv => "tv",
            Self::Printer => "printer",
            Self::Camera => "camera",
            Self::Speaker => "speaker",
            Self::Iot => "iot",
            Self::Unknown => "unknown",
        }
    }

    /// The kind a slug names, or `None` for anything else, `"unknown"` included.
    pub fn parse(slug: &str) -> Option<Self> {
        Self::VOTABLE.into_iter().find(|kind| kind.as_str() == slug)
    }

    /// Like [`Self::parse`], but anything unrecognised (a row written by a
    /// build with a kind this one lacks) reads as `Unknown`.
    pub fn from_slug(slug: &str) -> Self {
        Self::parse(slug).unwrap_or(Self::Unknown)
    }
}

/// How decisive the classifier's vote was. Mirrors `LanDeviceKindConfidence`:
/// `Low` is a thin-margin guess the UI hedges ("Phone?").
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum KindConfidence {
    High,
    Low,
}

impl std::fmt::Display for DeviceKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.pad(self.as_str())
    }
}

impl ToSql for DeviceKind {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for DeviceKind {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value.as_str().map(Self::from_slug)
    }
}

#[cfg(test)]
mod tests {
    use super::DeviceKind;

    #[test]
    fn round_trips_every_slug() {
        for kind in DeviceKind::VOTABLE {
            assert_eq!(DeviceKind::from_slug(kind.as_str()), kind);
        }
        assert_eq!(DeviceKind::from_slug("unknown"), DeviceKind::Unknown);
        assert_eq!(DeviceKind::from_slug("toaster"), DeviceKind::Unknown);
    }

    #[test]
    fn serializes_as_the_slug() {
        assert_eq!(serde_json::to_string(&DeviceKind::Iot).unwrap(), "\"iot\"");
        assert_eq!(serde_json::to_string(&super::KindConfidence::Low).unwrap(), "\"low\"");
        assert_eq!(serde_json::to_string(&crate::devices::DhcpStatus::Unavailable).unwrap(), "\"unavailable\"");
        assert_eq!(serde_json::to_string(&crate::apps::Support::Supported).unwrap(), "\"supported\"");
    }
}
