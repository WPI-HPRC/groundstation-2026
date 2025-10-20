// src-tauri/build.rs
use std::{
    env,
    fs,
    path::{Path, PathBuf},
};

fn build_proto() {
    // Resolve paths
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let workspace_root = manifest_dir.parent().expect("no parent").to_path_buf();
    let proto_dir = workspace_root.join("telemetry-2025");

    // Collect .proto files (non-recursive)
    let protos: Vec<PathBuf> = fs::read_dir(&proto_dir)
        .unwrap_or_else(|_| panic!("Failed to read {}", proto_dir.display()))
        .filter_map(|e| {
            let p = e.ok()?.path();
            (p.extension()?.to_str()? == "proto").then_some(p)
        })
        .collect();
    if protos.is_empty() {
        panic!("No .proto files found in {}", proto_dir.display());
    }

    // Rebuild when protos change (Cargo accepts paths outside crate)
    println!("cargo:rerun-if-changed={}", proto_dir.display());
    for p in &protos {
        println!("cargo:rerun-if-changed={}", p.display());
    }

    // Where generated Rust files land
    let out_rs_dir = Path::new("src").join("pb");
    fs::create_dir_all(&out_rs_dir).expect("create src/pb");

    // Use vendored protoc (no system install needed)
    let protoc_path = protoc_bin_vendored::protoc_bin_path()
        .expect("failed to locate vendored protoc");
    env::set_var("PROTOC", &protoc_path);

    let mut config = prost_build::Config::new();
    config.out_dir(&out_rs_dir);

    // --- Serde on messages/enums + camelCase on messages ---
    // (Avoid type_attribute(".") for derives to prevent duplicate derives)
    config.message_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]");
    config.message_attribute(".", r#"#[serde(rename_all = "camelCase")]"#);
    config.enum_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]");

    config.message_attribute(".", "#[serde(default)]");

    // --- Custom (de)serializer for 0/1 booleans in CSV ---
    // NOTE: these paths are <package>.<Message>.<field>
    // Your package is HPRC and fields are gpsLock/drogueDeploy/mainDeploy.
    config.field_attribute(
        "HPRC.RocketTelemetryPacket.gpsLock",
        "#[serde(with = \"crate::serde_bool_0_1\")]",
    );
    config.field_attribute(
        "HPRC.RocketTelemetryPacket.drogueDeploy",
        "#[serde(with = \"crate::serde_bool_0_1\")]",
    );
    config.field_attribute(
        "HPRC.RocketTelemetryPacket.mainDeploy",
        "#[serde(with = \"crate::serde_bool_0_1\")]",
    );

    // Files + include dirs
    let files: Vec<String> = protos
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();

    let include_dirs = vec![
        proto_dir.to_string_lossy().into_owned(),      // import "Packet.proto";
        workspace_root.to_string_lossy().into_owned(), // import "telemetry-2025/Packet.proto";
    ];

    // Compile
    config
        .compile_protos(&files, &include_dirs)
        .expect("prost: failed to compile protobufs (check imports)");
}

fn main() {
    build_proto();
    tauri_build::build();
}