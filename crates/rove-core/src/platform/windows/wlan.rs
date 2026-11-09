//! The Native Wi-Fi API (`wlanapi.dll`): the connected network and saved
//! profiles, as numbers and codes rather than `netsh`'s text, which Windows
//! translates into the display language.
//!
//! Every call here blocks briefly, so callers run it on a blocking thread.

use windows::core::{GUID, HSTRING, PWSTR};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::NetworkManagement::WiFi::{
    wlan_interface_state_connected, wlan_intf_opcode_channel_number, wlan_intf_opcode_current_connection,
    wlan_intf_opcode_rssi, WlanCloseHandle, WlanEnumInterfaces, WlanFreeMemory, WlanGetNetworkBssList, WlanGetProfile,
    WlanOpenHandle, WlanQueryInterface, DOT11_BSS_TYPE, WLAN_BSS_ENTRY, WLAN_BSS_LIST, WLAN_CONNECTION_ATTRIBUTES,
    WLAN_INTERFACE_INFO, WLAN_INTERFACE_INFO_LIST, WLAN_INTF_OPCODE, WLAN_PROFILE_GET_PLAINTEXT_KEY,
};

/// What the API says about the connected network, before it's labelled.
pub(crate) struct ConnectedNetwork {
    pub ssid: Option<String>,
    /// 0 to 100.
    pub signal_quality: u32,
    pub rssi_dbm: Option<i32>,
    pub channel: Option<u32>,
    /// From the access point's entry in the scan list, in kHz.
    pub centre_frequency_khz: Option<u32>,
    /// The access point's beacon information elements, for the channel width.
    pub information_elements: Vec<u8>,
    /// `DOT11_PHY_TYPE`: the 802.11 generation of the link.
    pub phy_type: i32,
    pub is_security_enabled: bool,
    /// `DOT11_AUTH_ALGORITHM`.
    pub auth_algorithm: i32,
}

const ERROR_SUCCESS: u32 = 0;
/// The API version Windows Vista and later speak.
const CLIENT_VERSION: u32 = 2;

/// An open client handle, closed when dropped.
struct Client(HANDLE);

impl Client {
    fn open() -> Option<Self> {
        let mut negotiated_version = 0;
        let mut handle = HANDLE::default();
        // SAFETY: both out-pointers are valid for the call.
        let status = unsafe { WlanOpenHandle(CLIENT_VERSION, None, &mut negotiated_version, &mut handle) };
        (status == ERROR_SUCCESS).then_some(Client(handle))
    }

    /// The machine's Wi-Fi adapters.
    fn interfaces(&self) -> Vec<WLAN_INTERFACE_INFO> {
        let mut list: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
        // SAFETY: `list` is a valid out-pointer; the API allocates what it points to.
        let status = unsafe { WlanEnumInterfaces(self.0, None, &mut list) };
        if status != ERROR_SUCCESS || list.is_null() {
            return Vec::new();
        }
        // SAFETY: on success `list` holds `dwNumberOfItems` entries laid out
        // from `InterfaceInfo`, which the API declares as a one-entry array.
        let interfaces = unsafe {
            let count = (*list).dwNumberOfItems as usize;
            std::slice::from_raw_parts((*list).InterfaceInfo.as_ptr(), count).to_vec()
        };
        // SAFETY: allocated by the API, and not used after this.
        unsafe { WlanFreeMemory(list as *const _) };
        interfaces
    }

    /// One `WlanQueryInterface` value, copied out as `T`.
    fn query<T: Copy>(&self, interface: &GUID, opcode: WLAN_INTF_OPCODE) -> Option<T> {
        let mut size = 0u32;
        let mut data: *mut core::ffi::c_void = std::ptr::null_mut();
        // SAFETY: the out-pointers are valid for the call.
        let status = unsafe { WlanQueryInterface(self.0, interface, opcode, None, &mut size, &mut data, None) };
        if status != ERROR_SUCCESS || data.is_null() || (size as usize) < std::mem::size_of::<T>() {
            return None;
        }
        // SAFETY: the API returned at least `size_of::<T>()` bytes of the type
        // this opcode documents; read_unaligned copies them out before freeing.
        let value = unsafe { std::ptr::read_unaligned(data as *const T) };
        // SAFETY: allocated by the API, and not used after this.
        unsafe { WlanFreeMemory(data as *const _) };
        Some(value)
    }

    /// The scan list's entry for `bssid`, with its centre frequency (kHz) and
    /// beacon information elements.
    fn access_point(&self, interface: &GUID, bssid: [u8; 6]) -> Option<(u32, Vec<u8>)> {
        let mut list: *mut WLAN_BSS_LIST = std::ptr::null_mut();
        // No SSID: every access point in the cached scan, which ignores the
        // BSS type and security arguments.
        // SAFETY: `list` is a valid out-pointer; the API allocates what it points to.
        let status = unsafe {
            WlanGetNetworkBssList(self.0, interface, None, DOT11_BSS_TYPE::default(), false, None, &mut list)
        };
        if status != ERROR_SUCCESS || list.is_null() {
            return None;
        }
        // SAFETY: on success `list` holds `dwNumberOfItems` entries from
        // `wlanBssEntries`, and each entry's elements sit `ulIeOffset` bytes
        // from the entry's start, `ulIeSize` long, inside the same allocation.
        let found = unsafe {
            let count = (*list).dwNumberOfItems as usize;
            let entries: &[WLAN_BSS_ENTRY] = std::slice::from_raw_parts((*list).wlanBssEntries.as_ptr(), count);
            entries.iter().find(|entry| entry.dot11Bssid == bssid).map(|entry| {
                let start = (entry as *const WLAN_BSS_ENTRY as *const u8).add(entry.ulIeOffset as usize);
                let elements = std::slice::from_raw_parts(start, entry.ulIeSize as usize).to_vec();
                (entry.ulChCenterFrequency, elements)
            })
        };
        // SAFETY: allocated by the API, and not used after this.
        unsafe { WlanFreeMemory(list as *const _) };
        found
    }

    /// A saved profile's XML, its key in plain text when the caller is an
    /// elevated administrator (otherwise Windows leaves it encrypted).
    fn profile_xml(&self, interface: &GUID, profile_name: &str) -> Option<String> {
        let mut xml = PWSTR::null();
        let mut flags = WLAN_PROFILE_GET_PLAINTEXT_KEY;
        // SAFETY: the out-pointers are valid for the call.
        let status = unsafe {
            WlanGetProfile(self.0, interface, &HSTRING::from(profile_name), None, &mut xml, Some(&mut flags), None)
        };
        if status != ERROR_SUCCESS || xml.is_null() {
            return None;
        }
        // SAFETY: on success `xml` is a null-terminated string the API allocated.
        let text = unsafe { xml.to_string() }.ok();
        // SAFETY: allocated by the API, and not used after this.
        unsafe { WlanFreeMemory(xml.0 as *const _) };
        text
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        // SAFETY: the handle came from WlanOpenHandle and is closed once.
        unsafe { WlanCloseHandle(self.0, None) };
    }
}

/// The first connected Wi-Fi adapter and its connection.
fn connected_interface(client: &Client) -> Option<(GUID, WLAN_CONNECTION_ATTRIBUTES)> {
    client.interfaces().into_iter().filter(|interface| interface.isState == wlan_interface_state_connected).find_map(
        |interface| {
            let guid = interface.InterfaceGuid;
            let connection = client.query::<WLAN_CONNECTION_ATTRIBUTES>(&guid, wlan_intf_opcode_current_connection)?;
            Some((guid, connection))
        },
    )
}

/// The SSID's bytes as text; `None` when empty.
fn ssid_text(connection: &WLAN_CONNECTION_ATTRIBUTES) -> Option<String> {
    let ssid = &connection.wlanAssociationAttributes.dot11Ssid;
    let length = (ssid.uSSIDLength as usize).min(ssid.ucSSID.len());
    let text = String::from_utf8_lossy(&ssid.ucSSID[..length]).into_owned();
    (!text.is_empty()).then_some(text)
}

/// The connected network, or `None` when no Wi-Fi adapter is connected.
pub(crate) fn connected_network() -> Option<ConnectedNetwork> {
    let client = Client::open()?;
    let (guid, connection) = connected_interface(&client)?;
    let association = &connection.wlanAssociationAttributes;
    let security = &connection.wlanSecurityAttributes;
    let access_point = client.access_point(&guid, association.dot11Bssid);
    Some(ConnectedNetwork {
        ssid: ssid_text(&connection),
        signal_quality: association.wlanSignalQuality,
        rssi_dbm: client.query::<i32>(&guid, wlan_intf_opcode_rssi),
        channel: client.query::<u32>(&guid, wlan_intf_opcode_channel_number),
        centre_frequency_khz: access_point.as_ref().map(|(frequency, _)| *frequency),
        information_elements: access_point.map(|(_, elements)| elements).unwrap_or_default(),
        phy_type: association.dot11PhyType.0,
        is_security_enabled: security.bSecurityEnabled.as_bool(),
        auth_algorithm: security.dot11AuthAlgorithm.0,
    })
}

/// The XML of the profile saved for `ssid`: the connected network's own
/// profile when it's that SSID, otherwise the profile named after it.
pub(crate) fn profile_xml(ssid: &str) -> Option<String> {
    let client = Client::open()?;
    if let Some((guid, connection)) = connected_interface(&client) {
        if ssid_text(&connection).as_deref() == Some(ssid) {
            let name_length = connection.strProfileName.iter().position(|&unit| unit == 0).unwrap_or(256);
            let profile_name = String::from_utf16_lossy(&connection.strProfileName[..name_length]);
            if let Some(xml) = client.profile_xml(&guid, &profile_name) {
                return Some(xml);
            }
        }
    }
    client.interfaces().iter().find_map(|interface| client.profile_xml(&interface.InterfaceGuid, ssid))
}
