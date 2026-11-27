fn main() {
    println!("cargo:rerun-if-env-changed=IWXA_T3_CONSUMER_SHA256");
    tauri_build::build();
}
