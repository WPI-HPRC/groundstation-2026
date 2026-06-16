use std::env;
use std::path::PathBuf;
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

    // Re-run build if any .fbs file changes
    println!("cargo:rerun-if-changed={}", schemas_dir.display());

    // Collect all .fbs files
    let fbs_files: Vec<PathBuf> = std::fs::read_dir(&schemas_dir)
        .expect("Failed to read schemas directory")
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.extension()?.to_str()? == "fbs" {
                Some(path)
            } else {
                None
            }
        })
        .collect();

    if fbs_files.is_empty() {
        println!("cargo:warning=No .fbs files found in {:?}", schemas_dir);
        return;
    }

    // Ensure output directory exists
    std::fs::create_dir_all(&out_dir).expect("Failed to create generated directory");

    // Invoke flatc for Rust bindings
    let status = Command::new("flatc")
        .arg("--rust")                        // generate Rust code
        .arg("--gen-all")                     // include all dependencies
        .arg("--no-prefix")                   // cleaner module paths
        .arg("-o").arg(&out_dir)              // output directory
        .arg("-I").arg(&schemas_dir)          // include path for imports
        .args(&fbs_files)
        .status()
        .expect(
            "Failed to run `flatc`. Make sure FlatBuffers compiler is installed and on PATH.\n\
             Install: https://google.github.io/flatbuffers/flatbuffers_guide_building.html"
        );

    assert!(status.success(), "flatc failed with status: {}", status);

    println!("cargo:warning=FlatBuffers schemas compiled to {:?}", out_dir);
}