#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(e) = notedeck_lib::run() {
        eprintln!("Application error: {e}");
        std::process::exit(1);
    }
}
