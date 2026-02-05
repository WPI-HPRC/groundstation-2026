// Handles storing telemetry data and writing to CSV with dynamic fields
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use chrono::{Utc};

// list of stores
pub struct TelemetryStores {
    stores: Mutex<HashMap<String, Arc<TelemetryStore>>>,
}

impl TelemetryStores {
    pub fn new() -> Self {
        TelemetryStores { 
            stores: Mutex::new(HashMap::new()),
        }
    }

    pub fn shutdown(&self) {
        // iterate over all the stores we have
        let keys = self.list_stores();
        let stores = self.stores.lock().unwrap();
        for key in keys {
            let store = stores.get(&key);
            if store.is_some() {
                Option::expect(store, "").shutdown();
            }
        }
    }

    pub fn create_new_store(&self, store_name: &str, path: PathBuf) -> Result<(), String>{
        let mut stores = self.stores.lock().unwrap();
        
        let store_name = store_name.into();

        if stores.contains_key(&store_name) {
            return Err("Store already exists".into());
        }

        let store = Arc::new(TelemetryStore::new(path));
        stores.insert(store_name, store);
        Ok(())

    }

    pub fn list_stores(&self) -> Vec<String> {
        let stores = self.stores.lock().unwrap();
        stores.keys().cloned().collect()
    }
    
    pub fn has_store(&self, store_name: &str) -> bool {
        let stores = self.stores.lock().unwrap();
        stores.contains_key(store_name)
    }

    pub fn push(&self, store_name: &str, field: &str, data: TelemetryData) -> Result<(), String> {
        self.get_store(store_name)?
            .push(field, data);
        Ok(())
        
    }

    pub fn get_last(&self, store_name: &str, field: &str) -> Result<Option<TelemetryData>, String> {
        let data = self.get_field(store_name, field)?.data;
        Ok(data.last().cloned())
    }

    pub fn get_last_n(&self, store_name: &str, field: &str, n: usize) -> Result<Option<Vec<TelemetryData>>, String> {
        let data = self.get_field(store_name, field)?.data;
        if data.is_empty() || n == 0 {
            return Ok(None)
        }

        let len = data.len();
        let start = len.saturating_sub(n);

        Ok(Some(data[start..].to_vec()))
    }

    pub fn get_all(&self, store_name: &str, field: &str) -> Result<Vec<TelemetryData>, String> {
        let data = self.get_field(store_name, field)?.data;
        Ok(data.clone())
    }

    fn get_store(&self, store_name: &str) -> Result<Arc<TelemetryStore>, String> {
        self.stores.lock().unwrap().get(store_name).cloned()
        .ok_or_else(|| format!("No store named '{}'", store_name))
    }

    fn get_field(&self, store_name: &str, field: &str) -> Result<TelemetryField, String> {
        self.get_store(store_name)?.fields.lock().unwrap().get(field).cloned()
            .ok_or_else(|| format!("No field named '{}'", field))
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
    fields: Mutex<HashMap<String, TelemetryField>>,
    
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
            fields: Mutex::new(HashMap::new()),

            csv_tx: tx,
            recording: AtomicBool::new(false),
            
            max_buffer_size, 
            current_row: HashMap::new(), 
            current_timestamp: None, 
        }
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

    fn push(&self, field: &str, data: TelemetryData) {
        {
            let mut fields = self.fields.lock().unwrap();
            fields
                .entry(field.to_string())
                .or_insert_with(|| TelemetryField::new())
                .push(data);
        }

        let row = {
            let fields = self.fields.lock().unwrap();
            fields
                .iter()
                .map(|(k,f)| {
                    (
                        k.clone(),
                        f.get_last()
                            .map(|d| d.value.to_string())
                            .unwrap_or_default(),
                    )
                })
                .collect::<HashMap<_, _>>()
        };

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

    // tell our async thread to close the file handle
    fn shutdown(&self) {
        self.recording.store(false, Ordering::Release);
        let _ = self.csv_tx.try_send(CsvCommand::Stop);
    }

    fn get_last(&self, field: &str) -> Result<Option<TelemetryData>, String> {
        let data = self.get_field(field)?.data;
        Ok(data.last().cloned())
    }

    fn get_last_n(&self, field: &str, n: usize) -> Result<Option<Vec<TelemetryData>>, String> {
        let data = self.get_field(field)?.data;
        if data.is_empty() || n == 0 {
            return Ok(None)
        }

        let len = data.len();
        let start = len.saturating_sub(n);

        Ok(Some(data[start..].to_vec()))
    }

    fn get_all(&self, field: &str) -> Result<Vec<TelemetryData>, String> {
        let data = self.get_field(field)?.data;
        Ok(data.clone())
    }

    fn get_field(&self, field: &str) -> Result<TelemetryField, String> {
        self.fields.lock().unwrap().get(field).cloned()
        .ok_or_else(|| format!("No field named '{}'", field))
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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryData {
    pub timestamp: i64,
    pub value: Value,
}

impl TelemetryData {
    fn new() -> Self {
        TelemetryData { 
            timestamp: Utc::now().timestamp_millis(), 
            value: Value::Null,
        }
    }

    fn with_timestamp(timestamp: i64) -> Self {
        TelemetryData { timestamp, value: Value::Null }
    }

    fn with_value<T: Serialize>(&mut self, value: T) -> Result<(), serde_json::Error> {
        self.value = serde_json::to_value(value)?;
        Ok(())
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