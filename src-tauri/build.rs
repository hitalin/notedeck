fn main() {
    // Embed rustc version at build time
    if let Ok(output) = std::process::Command::new("rustc")
        .arg("--version")
        .output()
    {
        if let Ok(version) = String::from_utf8(output.stdout) {
            // "rustc 1.XX.X (hash date)" → "1.XX.X"
            let short = version
                .trim()
                .strip_prefix("rustc ")
                .and_then(|s| s.split_whitespace().next())
                .unwrap_or("unknown");
            println!("cargo:rustc-env=RUSTC_VERSION_INFO={short}");
        }
    }
    tauri_build::build()
}
