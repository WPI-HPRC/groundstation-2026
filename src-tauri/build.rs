use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    // do this first so that later imports don't fail
    compile_flatbuffers();
    // Required for Tauri — must always be called
    tauri_build::build();
}

fn compile_flatbuffers() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let schemas_dir = manifest_dir.join("telemetry-2026");
    let out_dir = manifest_dir.join("src").join("telemetry-generated");
    let packet_out = out_dir.join("Packet_generated.rs");

    println!("cargo:rerun-if-changed={}", schemas_dir.display());

    std::fs::create_dir_all(&out_dir).expect("Failed to create generated directory");

    let fbs_files: Vec<PathBuf> = match std::fs::read_dir(&schemas_dir) {
        Ok(entries) => entries
            .filter_map(|entry| {
                let path = entry.ok()?.path();
                if path.extension()?.to_str()? == "fbs" {
                    Some(path)
                } else {
                    None
                }
            })
            .collect(),
        Err(_) => Vec::new(),
    };

    if fbs_files.is_empty() {
        if packet_out.exists() {
            println!(
                "cargo:warning=No .fbs schemas in {:?}; using existing generated bindings",
                schemas_dir
            );
            return;
        }

        panic!(
            "No FlatBuffers schemas found in {}. \
             Run `git submodule update --init --recursive` in the worktree root.",
            schemas_dir.display()
        );
    }

    if !flatc_is_usable() {
        if packet_out.exists() {
            println!(
                "cargo:warning=Skipping incompatible or missing flatc; using existing generated bindings in {:?}",
                out_dir
            );
            return;
        }

        panic!(
            "FlatBuffers schemas are present but flatc 24+ is missing or incompatible (flatc 2.x will not work). \
             Install flatbuffers 25.x and ensure `flatc` is on PATH, then rebuild."
        );
    }

    match run_flatc(&schemas_dir, &out_dir, &fbs_files) {
        Ok(()) => {
            println!("cargo:warning=FlatBuffers schemas compiled to {:?}", out_dir);
        }
        Err(err) => {
            if packet_out.exists() {
                println!(
                    "cargo:warning=flatc failed ({err}); using existing generated bindings in {:?}",
                    out_dir
                );
                return;
            }

            panic!("flatc failed ({err}) and no generated bindings exist in {:?}", out_dir);
        }
    }
}

fn flatc_is_usable() -> bool {
    let output = match Command::new("flatc").arg("--version").output() {
        Ok(output) => output,
        Err(_) => return false,
    };

    if !output.status.success() {
        return false;
    }

    let version = String::from_utf8_lossy(&output.stdout);
    // flatbuffers crate 25.x needs flatc 24+; flatc 2.x emits incompatible Rust bindings.
    !version.contains("flatc version 2.")
}

fn run_flatc(schemas_dir: &Path, out_dir: &Path, fbs_files: &[PathBuf]) -> Result<(), String> {
    let status = Command::new("flatc")
        .arg("--rust")
        .arg("--gen-all")
        .arg("--no-prefix")
        .arg("-o")
        .arg(out_dir)
        .arg("-I")
        .arg(schemas_dir)
        .args(fbs_files)
        .status()
        .map_err(|err| err.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("flatc failed with status: {status}"))
    }
}
