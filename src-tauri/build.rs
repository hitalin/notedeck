fn main() {
    // Extract notecli git hash from Cargo.lock
    if let Ok(lock) = std::fs::read_to_string("Cargo.lock") {
        for line in lock.lines() {
            // source = "git+https://...notecli.git?rev=...#<full_hash>"
            if line.contains("notecli.git") {
                if let Some(hash) = line.rsplit('#').next() {
                    let hash = hash.trim().trim_end_matches('"');
                    println!("cargo:rustc-env=NOTECLI_GIT_HASH={hash}");
                    break;
                }
            }
        }
    }
    tauri_build::build()
}
