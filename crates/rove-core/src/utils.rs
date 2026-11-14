//! Small helpers the domains share.
pub mod geoip;
pub mod mac;
pub mod net;
pub mod shell;
pub mod tls;

/// `value` rounded to the nearest whole number. Out-of-range values clamp to
/// `i64::MIN` or `i64::MAX` and NaN becomes 0.
#[expect(clippy::cast_possible_truncation, reason = "a float-to-int `as` saturates, which is the clamp wanted")]
pub fn round_to_i64(value: f64) -> i64 {
    value.round() as i64
}
