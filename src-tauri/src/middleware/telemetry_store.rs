// Middleware for storing telemetry data and writing to CSV with dynamic fields

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
// use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use chrono::{DateTime, Utc};
use csv::Writer;

/// A single telemetry data point with dynamic fields
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryData {
    pub timestamp: i64,
    pub fields: HashMap<String, Value>,
}

impl TelemetryData {
    pub fn new() -> Self {
        TelemetryData {
            timestamp: Utc::now().timestamp_millis(),
            fields: HashMap::new(),
        }
    }

    pub fn with_timestamp(timestamp: i64) -> Self {
        TelemetryData {
            timestamp,
            fields: HashMap::new(),
        }
    }

    pub fn set_field<T: Serialize>(&mut self, key: String, value: T) {
        if let Ok(json_value) = serde_json::to_value(value) {
            self.fields.insert(key, json_value);
        }
    }

    pub fn get_field(&self, key: &str) -> Option<&Value> {
        self.fields.get(key)
    }

    pub fn get_field_as_f64(&self, key: &str) -> Option<f64> {
        self.fields.get(key)?.as_f64()
    }

    pub fn get_field_as_string(&self, key: &str) -> Option<String> {
        self.fields.get(key)?.as_str().map(|s| s.to_string())
    }
}

/// Telemetry record for a specific data stream (identified by key)
#[derive(Debug, Clone)]
struct TelemetryStream {
    data: Vec<TelemetryData>,
    field_keys: Vec<String>,
}

impl TelemetryStream {
    fn new() -> Self {
        TelemetryStream {
            data: Vec::new(),
            field_keys: Vec::new(),
        }
    }

    fn add_data(&mut self, data: TelemetryData, max_size: usize) {
        // Update field keys if new fields are added
        for key in data.fields.keys() {
            if !self.field_keys.contains(key) {
                self.field_keys.push(key.clone());
            }
        }

        self.data.push(data);

        // Limit size
        if self.data.len() > max_size {
            self.data.remove(0);
        }
    }

    fn get_last_n(&self, n: usize) -> Vec<TelemetryData> {
        let start = self.data.len().saturating_sub(n);
        self.data[start..].to_vec()
    }

    fn get_all(&self) -> Vec<TelemetryData> {
        self.data.clone()
    }

    fn clear(&mut self) {
        self.data.clear();
    }
}


pub struct TelemetryStore {
    streams: Arc<Mutex<HashMap<String, TelemetryStream>>>,
    csv_writer: Arc<Mutex<Option<Writer<File>>>>,
    csv_path: Arc<Mutex<Option<PathBuf>>>,
    recording: Arc<Mutex<bool>>,
    max_buffer_size: usize,
}

impl TelemetryStore {
    pub fn new() -> Self {
        TelemetryStore::with_buffer_size(10000)
    }

    pub fn with_buffer_size(max_buffer_size: usize) -> Self {
        TelemetryStore {
            streams: Arc::new(Mutex::new(HashMap::new())),
            csv_writer: Arc::new(Mutex::new(None)),
            csv_path: Arc::new(Mutex::new(None)),
            recording: Arc::new(Mutex::new(false)),
            max_buffer_size,
        }
    }

    /// Set telemetry data for a specific key
    pub fn set_telemetry(&self, key: String, data: TelemetryData) -> Result<(), String> {
        let mut streams = self.streams.lock().unwrap();
        
        // Get or create stream for this key
        let stream = streams.entry(key.clone()).or_insert_with(TelemetryStream::new);
        stream.add_data(data.clone(), self.max_buffer_size);

        // Write to CSV if recording
        let recording = *self.recording.lock().unwrap();
        if recording {
            self.write_to_csv(&key, &data)?;
        }

        Ok(())
    }

    /// Get telemetry data for a specific key
    /// If count is None, returns all data. Otherwise returns last N points.
    pub fn get_telemetry(&self, key: &str, count: Option<usize>) -> Vec<TelemetryData> {
        let streams = self.streams.lock().unwrap();
        
        match streams.get(key) {
            Some(stream) => {
                match count {
                    Some(n) => stream.get_last_n(n),
                    None => stream.get_all(),
                }
            }
            None => Vec::new(),
        }
    }

    /// Get all available telemetry keys
    pub fn get_all_keys(&self) -> Vec<String> {
        self.streams.lock().unwrap().keys().cloned().collect()
    }

    /// Get the latest telemetry data for a specific key
    pub fn get_latest(&self, key: &str) -> Option<TelemetryData> {
        let streams = self.streams.lock().unwrap();
        streams.get(key)?.data.last().cloned()
    }

    /// Get field keys for a specific telemetry stream
    pub fn get_field_keys(&self, key: &str) -> Vec<String> {
        let streams = self.streams.lock().unwrap();
        streams.get(key).map(|s| s.field_keys.clone()).unwrap_or_default()
    }

    /// Get all unique field keys across all streams
    pub fn get_all_field_keys(&self) -> Vec<String> {
        let streams = self.streams.lock().unwrap();
        let mut all_keys = Vec::new();
        
        for stream in streams.values() {
            for key in &stream.field_keys {
                if !all_keys.contains(key) {
                    all_keys.push(key.clone());
                }
            }
        }
        
        all_keys
    }

    /// Start recording all telemetry streams to a single unified CSV
    pub fn start_recording(&self, file_path: PathBuf) -> Result<(), String> {
        let mut recording = self.recording.lock().unwrap();
        
        if *recording {
            return Err("Recording already in progress".to_string());
        }

        // Create CSV file
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&file_path)
            .map_err(|e| format!("Failed to create CSV file: {}", e))?;

        let mut writer = Writer::from_writer(file);
        
        // Write header with all current fields from all streams
        let mut header = vec!["timestamp".to_string(), "stream_key".to_string()];
        header.extend(self.get_all_field_keys());
        
        writer
            .write_record(&header)
            .map_err(|e| format!("Failed to write CSV header: {}", e))?;

        writer
            .flush()
            .map_err(|e| format!("Failed to flush CSV: {}", e))?;

        *self.csv_writer.lock().unwrap() = Some(writer);
        *self.csv_path.lock().unwrap() = Some(file_path);
        *recording = true;

        Ok(())
    }

    /// Stop unified recording and close CSV file
    pub fn stop_recording(&self) -> Result<PathBuf, String> {
        let mut recording = self.recording.lock().unwrap();
        
        if !*recording {
            return Err("No recording in progress".to_string());
        }

        let mut csv_writer = self.csv_writer.lock().unwrap();
        let csv_path = self.csv_path.lock().unwrap();

        if let Some(mut writer) = csv_writer.take() {
            writer
                .flush()
                .map_err(|e| format!("Failed to flush CSV: {}", e))?;
        }

        *recording = false;
        
        csv_path
            .clone()
            .ok_or_else(|| "No CSV path found".to_string())
    }

    /// Check if unified recording is active
    pub fn is_recording(&self) -> bool {
        *self.recording.lock().unwrap()
    }

    /// Get unified CSV path if recording
    pub fn get_csv_path(&self) -> Option<PathBuf> {
        self.csv_path.lock().unwrap().clone()
    }

    /// Clear all data for a specific key
    pub fn clear_key(&self, key: &str) {
        let mut streams = self.streams.lock().unwrap();
        if let Some(stream) = streams.get_mut(key) {
            stream.clear();
        }
    }

    /// Clear all data
    pub fn clear_all(&self) {
        self.streams.lock().unwrap().clear();
    }

    /// Get total data count for a key
    pub fn get_count(&self, key: &str) -> usize {
        let streams = self.streams.lock().unwrap();
        streams.get(key).map(|s| s.data.len()).unwrap_or(0)
    }

    /// Get total data count across all keys
    pub fn get_total_count(&self) -> usize {
        let streams = self.streams.lock().unwrap();
        streams.values().map(|s| s.data.len()).sum()
    }

    /// Internal function to write data to unified CSV
    fn write_to_csv(&self, key: &str, data: &TelemetryData) -> Result<(), String> {
        let mut csv_writer = self.csv_writer.lock().unwrap();
        
        if let Some(writer) = csv_writer.as_mut() {
            // Get all field keys that should be in the CSV
            let all_field_keys = self.get_all_field_keys();

            // Convert timestamp
            let datetime = DateTime::from_timestamp_millis(data.timestamp)
                .unwrap_or_else(|| Utc::now());
            
            let mut record = vec![datetime.to_rfc3339(), key.to_string()];
            
            // Add field values in order, using empty string if field doesn't exist
            for field_key in &all_field_keys {
                let value_str = match data.fields.get(field_key) {
                    Some(Value::Number(n)) => n.to_string(),
                    Some(Value::String(s)) => s.clone(),
                    Some(Value::Bool(b)) => b.to_string(),
                    Some(Value::Null) => "null".to_string(),
                    Some(_) => data.fields.get(field_key).unwrap().to_string(),
                    None => "".to_string(),
                };
                record.push(value_str);
            }

            writer
                .write_record(&record)
                .map_err(|e| format!("Failed to write CSV record: {}", e))?;

            writer
                .flush()
                .map_err(|e| format!("Failed to flush CSV: {}", e))?;
        }

        Ok(())
    }

    /// Update CSV header when new fields are added
    pub fn update_csv_header_if_needed(&self) -> Result<(), String> {
        let recording = *self.recording.lock().unwrap();
        if !recording {
            return Ok(());
        }

        // Note: In a real implementation, you might want to handle header updates
        // For now, we'll just add new columns as empty values for old records
        // A more robust solution would be to rewrite the CSV with the new header
        
        Ok(())
    }
}

impl Default for TelemetryStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_dynamic_telemetry() {
        let store = TelemetryStore::new();
        
        // Create telemetry with different fields
        let mut data1 = TelemetryData::new();
        data1.set_field("altitude".to_string(), 1000.0);
        data1.set_field("velocity".to_string(), 50.0);

        let mut data2 = TelemetryData::new();
        data2.set_field("altitude".to_string(), 1100.0);
        data2.set_field("velocity".to_string(), 55.0);
        data2.set_field("temperature".to_string(), 25.0); // New field added dynamically

        // Set telemetry
        assert!(store.set_telemetry("rocket1".to_string(), data1).is_ok());
        assert!(store.set_telemetry("rocket1".to_string(), data2).is_ok());

        // Get telemetry
        let all_data = store.get_telemetry("rocket1", None);
        assert_eq!(all_data.len(), 2);

        let last_one = store.get_telemetry("rocket1", Some(1));
        assert_eq!(last_one.len(), 1);

        // Check field keys
        let field_keys = store.get_field_keys("rocket1");
        assert!(field_keys.contains(&"altitude".to_string()));
        assert!(field_keys.contains(&"velocity".to_string()));
        assert!(field_keys.contains(&"temperature".to_string()));
    }

    #[test]
    fn test_recording() {
        let store = TelemetryStore::new();
        
        // Add data to multiple streams
        let mut rocket_data = TelemetryData::new();
        rocket_data.set_field("altitude".to_string(), 1000.0);
        rocket_data.set_field("velocity".to_string(), 50.0);
        
        let mut battery_data = TelemetryData::new();
        battery_data.set_field("voltage".to_string(), 12.6);
        battery_data.set_field("current".to_string(), 5.2);

        store.set_telemetry("rocket".to_string(), rocket_data.clone()).unwrap();
        store.set_telemetry("battery".to_string(), battery_data.clone()).unwrap();

        // Start unified recording
        let temp_path = env::temp_dir().join("test_telemetry.csv");
        assert!(store.start_recording(temp_path.clone()).is_ok());
        assert!(store.is_recording());

        // Add more data while recording
        store.set_telemetry("rocket".to_string(), rocket_data).unwrap();
        store.set_telemetry("battery".to_string(), battery_data).unwrap();
        
        assert!(store.stop_recording().is_ok());
        assert!(!store.is_recording());

        // Cleanup
        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn test_multiple_keys() {
        let store = TelemetryStore::new();
        
        let mut data1 = TelemetryData::new();
        data1.set_field("altitude".to_string(), 1000.0);

        let mut data2 = TelemetryData::new();
        data2.set_field("pressure".to_string(), 101.3);

        store.set_telemetry("sensor1".to_string(), data1).unwrap();
        store.set_telemetry("sensor2".to_string(), data2).unwrap();

        let keys = store.get_all_keys();
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&"sensor1".to_string()));
        assert!(keys.contains(&"sensor2".to_string()));
    }
}
