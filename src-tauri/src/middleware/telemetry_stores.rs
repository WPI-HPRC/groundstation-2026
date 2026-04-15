// Handles storing telemetry data and writing to CSV with dynamic fields
use serde::Serialize;
use std::collections::HashMap;
use std::path::{PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use dashmap::DashMap;
use dashmap::mapref::one::Ref;
use std::fmt;

// list of stores
pub struct TelemetryStores {
    stores: DashMap<String, TelemetryStore>,
}
impl TelemetryStores {
    pub fn new() -> Self {
        TelemetryStores { 
            stores: DashMap::new(),
        }
    }

    pub fn shutdown(&self) {
        // iterate over all the stores we have
        for store in self.stores.iter() {
            store.value().shutdown();
        }
    }

    pub fn create_new_store(&self, store_name: &str, path: PathBuf) -> Result<(), String>{
        self.stores.
        entry(store_name.to_string()).
        or_insert_with(|| TelemetryStore::new(path));

        Ok(())
    }

    pub fn list_stores(&self) -> Vec<String> {
        self.stores.iter().map(|s| s.key().clone()).collect()
    }
    
    pub fn has_store(&self, store_name: &str) -> bool {
        self.stores.contains_key(store_name)
    }

    pub fn push(&self, store_name: &str, field: &str, data: TelemetryData) -> Result<(), String> {
        let mut store = self.stores.get_mut(store_name).ok_or_else(|| format!("No store named '{}'", store_name))?;

        store.push(field, data);
        Ok(())
    }

    pub fn get_last(&self, store_name: &str, field: &str) -> Result<Option<TelemetryData>, String> {
        let store = self.get_store(store_name)?;

        store.get_last(field)
    }

    pub fn get_last_n(&self, store_name: &str, field: &str, n: usize) -> Result<Option<Vec<TelemetryData>>, String> {
        let store = self.get_store(store_name)?;

        store.get_last_n(field, n)
    }

    pub fn get_all(&self, store_name: &str, field: &str) -> Result<Vec<TelemetryData>, String> {
        let store = self.get_store(store_name)?;

        store.get_all(field)
    }

    fn get_store(&self, store_name: &str,) -> Result<Ref<'_, String, TelemetryStore>, String> {
        self.stores
            .get(store_name)
            .ok_or_else(|| format!("No store named '{}'", store_name))
    }

    pub fn start_recording(&self, store_name: &str) -> Result<(), String> {
        self.get_store(store_name)?.start_recording();
        Ok(())
    }

    pub fn stop_recording(&self, store_name: &str) -> Result<(), String> {
        self.get_store(store_name)?.stop_recording();
        Ok(())
    }


}

// A store has all grouped items under one label, 
//  that will be written into it's own CSV file
#[derive(Debug)]
struct TelemetryStore {
    fields: DashMap<String, Vec<TelemetryData>>,

    csv_tx: tokio::sync::mpsc::Sender<CsvCommand>,
    recording: AtomicBool,

    max_buffer_size: usize,

    current_row: HashMap<String, TelemetryData>,
    current_timestamp: Option<i64>,
}
impl TelemetryStore {
    fn new(path: PathBuf) -> Self {
        Self::with_buffer_size(path, 10_000)
    }

    fn with_buffer_size(path: PathBuf, max_buffer_size: usize) -> Self {
        let (tx, rx) = tokio::sync::mpsc::channel(1024);

        spawn_csv_writer_task(rx, path);

        Self { 
            fields: DashMap::new(),

            csv_tx: tx,
            recording: AtomicBool::new(false),
            
            max_buffer_size, 
            current_row: HashMap::new(), 
            current_timestamp: None, 
        }
    }

    // tell our async thread to close the file handle
    fn shutdown(&self) {
        self.recording.store(false, Ordering::Release);
        let _ = self.csv_tx.try_send(CsvCommand::Stop);
    }


    fn start_recording(&self) {
        self.recording.store(true, Ordering::Release);
    }

    fn stop_recording(&self) {
        // stop accepting new rows to the reader
        self.recording.store(false, Ordering::Release);

        // flush pending data async
        let _ = self.csv_tx.try_send(CsvCommand::Flush);
    }

    fn push(&mut self, field: &str, data: TelemetryData) {
        if self.current_timestamp != Some(data.timestamp) { // if our last recorded timestamp doesn't match the timestamp of our current datapoint
            if self.recording.load(Ordering::Acquire) { // if we're recording
                self.write_row(); // write the current row of data to the csv before getting any new data
            }
                    
            self.current_timestamp = Some(data.timestamp); // update our timestamp
        }

        let mut field_vec = self.fields
            .entry(field.to_string())
            .or_insert_with(|| Vec::new());
        field_vec.push(data);
    }

    fn write_row(&self) {
        let mut row = {
            self.fields
                .iter()
                .map(|(entry)| {
                        let k = entry.key().clone();
                        let f = entry.value();

                        let v = f
                            .last()
                            .map(|d| d.value.to_string())
                            .unwrap_or_default();
                        (k,v)
                })
                .collect::<HashMap<_, _>>()
        };
        // add timestamp
        row.insert("timestamp".to_owned(), self.current_timestamp.unwrap_or(0).to_string());

        // send our command through the channel to be written to csv async
        let _ = self.csv_tx.try_send(CsvCommand::Row(row));
    }

    fn flush_row(&self) {
        let _ = self.csv_tx.try_send(CsvCommand::Flush);
    }

    fn reset_row(&mut self) {
        self.current_row.clear();
        self.current_timestamp = None;
    }


    fn get_last(&self, field: &str) -> Result<Option<TelemetryData>, String> {
        Ok(
            self.fields
            .get(field)
            .map(|v| v.last().cloned())
            .ok_or_else(|| format!("No field named '{}'", field))
            .ok()
            .flatten()
        )
    }

    fn get_last_n(&self, field: &str, n: usize) -> Result<Option<Vec<TelemetryData>>, String> {
        let vec = self
            .fields
            .get(field)
            .ok_or_else(|| format!("No field named '{}'", field))?
            .clone();

        if vec.is_empty() || n == 0 {
            return Ok(None);
        }

        let start = vec.len().saturating_sub(n);
        Ok(Some(vec[start..].to_vec()))
    }

    fn get_all(&self, field: &str) -> Result<Vec<TelemetryData>, String> {
        self.fields
            .get(field)
            .map(|v| v.clone())
            .ok_or_else(|| format!("No field named '{}'", field))
    }

    fn get_field_keys(&self) -> Vec<String> {
        self.fields.iter().map(|e| e.key().clone()).collect() 
    }

}


// all data for a specific label
#[derive(Debug, Clone)]
struct TelemetryField {
    data: Vec<TelemetryData>,
}

impl TelemetryField {
    fn new() -> Self {
        Self::with_capacity(0)
    }

    fn with_capacity(capacity: usize) -> Self {
        TelemetryField { 
            data: Vec::with_capacity(capacity), 
        }
    }

    fn push(&mut self, data: TelemetryData) {
        self.data.push(data);
    }

    fn get_last(&self) -> Option<TelemetryData> {
        self.data.last().cloned()
    }

    fn get_last_n(&self, n: usize) -> Option<Vec<TelemetryData>> {
        if self.data.is_empty() || n == 0 {
            return None
        }

        let len = self.data.len();
        let start = len.saturating_sub(n);

        Some(self.data[start..].to_vec())
    }

    fn get_all(&self) -> Vec<TelemetryData> {
        self.data.clone()
    }

    fn clear(&mut self) {
        self.data.clear();
    }
}



// single datapoint
#[derive(Debug, Clone, Serialize)]
pub struct TelemetryData {
    pub timestamp: i64,
    pub value: TelemetryValue,
}
impl TelemetryData {
    pub fn new() -> Self {
        Self {
            timestamp: chrono::Utc::now().timestamp_millis(),
            value: TelemetryValue::default(),
        }
    }
    pub fn with_timestamp(mut self, timestamp: i64) -> Self {
        self.timestamp = timestamp;
        self
    }
    pub fn with_value<T: Into<TelemetryValue>>(mut self, value: T) -> Self {
        self.value = value.into();
        self
    }
}
impl Serialize for TelemetryValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            TelemetryValue::F64(v) => serializer.serialize_f64(*v),
            TelemetryValue::I64(v) => serializer.serialize_i64(*v),
            TelemetryValue::U64(v) => serializer.serialize_u64(*v),
            TelemetryValue::Bool(v) => serializer.serialize_bool(*v),
        }
    }
}
impl Default for TelemetryData {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TelemetryValue {
    F64(f64),
    I64(i64),
    U64(u64),
    Bool(bool),
}
impl Default for TelemetryValue {
    fn default() -> Self {
        Self::F64(0.0)
    }
}
impl From<f64> for TelemetryValue {
    fn from(v: f64) -> Self {
        TelemetryValue::F64(v)
    }
}
impl From<i64> for TelemetryValue {
    fn from(v: i64) -> Self {
        TelemetryValue::I64(v)
    }
}
impl From<u64> for TelemetryValue {
    fn from(v: u64) -> Self {
        TelemetryValue::U64(v)
    }
}
impl From<bool> for TelemetryValue {
    fn from(v: bool) -> Self {
        TelemetryValue::Bool(v)
    }
}
impl From<i32> for TelemetryValue {
    fn from(v: i32) -> Self {
        TelemetryValue::I64(v as i64)
    }
}
impl From<u32> for TelemetryValue {
    fn from(v: u32) -> Self {
        TelemetryValue::U64(v as u64)
    }
}
impl fmt::Display for TelemetryValue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TelemetryValue::F64(v) => write!(f, "{}", v),
            TelemetryValue::I64(v) => write!(f, "{}", v),
            TelemetryValue::U64(v) => write!(f, "{}", v),
            TelemetryValue::Bool(v) => write!(f, "{}", v),
        }
    }
}


// used for async writing of our csv files to keep the main program thread responsive
enum CsvCommand {
    Row(HashMap<String, String>),
    Flush,
    Stop,
}

fn spawn_csv_writer_task(
    mut rx: tokio::sync::mpsc::Receiver<CsvCommand>,
    path: PathBuf,
) { tokio::spawn(async move {
        
    let file = std::fs::File::create(path)
        .expect("failed to create CSV file");

    let mut writer = csv::Writer::from_writer(file);

    let mut headers: Vec<String> = Vec::new();
    let mut buffered_rows: Vec<HashMap<String, String>> = Vec::new();
    let mut header_written = false;

    while let Some(cmd) = rx.recv().await {
        match cmd {
            CsvCommand::Row(row) => {
                if !header_written {
                    buffered_rows.push(row);
                } else {
                    write_csv_row(&mut writer, &headers, row);
                }
            }
            CsvCommand::Flush => {
                if !header_written && !buffered_rows.is_empty() {
                    // build header
                    for row in &buffered_rows {
                        for k in row.keys() {
                            if !headers.contains(k) {
                                headers.push(k.clone());
                            }
                        }
                    }

                    writer.write_record(&headers).ok();

                    for row in buffered_rows.drain(..) {
                        write_csv_row(&mut writer, &headers, row);
                    }

                    header_written = true;
                }

                writer.flush().ok();
            }
            CsvCommand::Stop => break,                
            }
    }  

    writer.flush().ok();
    });
}

fn write_csv_row(
    writer: &mut csv::Writer<std::fs::File>,
    headers: &[String],
    row: HashMap<String, String>,
) {
    let record = headers
        .iter()
        .map(|h| row.get(h).cloned().unwrap_or_default())
        .collect::<Vec<_>>();

    let _ = writer.write_record(&record);
}