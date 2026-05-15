//! Guards that the committed `src/bindings.ts` snapshot stays in sync with the
//! tauri-specta command/event lists registered in `lib.rs`. The same builder
//! powers the runtime export, the `gen_bindings` example, and this test, so
//! any drift between handlers and bindings.ts surfaces here.
//!
//! If this test fails, run `cargo run --example gen_bindings` and commit the
//! result.

#[test]
fn bindings_snapshot_is_current() {
    let tmp = tempfile::NamedTempFile::new().expect("create tempfile for bindings export");
    notedeck_lib::export_typescript_bindings(tmp.path()).expect("export typescript bindings");

    let generated = std::fs::read_to_string(tmp.path()).expect("read generated bindings");
    let committed = include_str!("../../src/bindings.ts");

    assert_eq!(
        generated.trim(),
        committed.trim(),
        "bindings.ts is stale — run `cargo run --example gen_bindings` and commit the result",
    );
}
