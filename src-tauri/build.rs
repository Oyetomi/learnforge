fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=src/macos_speech.m");
        println!("cargo:rerun-if-changed=src/macos_narration_key.m");
        println!("cargo:rerun-if-changed=Info.plist");
        cc::Build::new()
            .file("src/macos_speech.m")
            .file("src/macos_narration_key.m")
            .flag("-fobjc-arc")
            .flag("-mmacosx-version-min=11.0")
            .flag("-Wno-deprecated-declarations")
            .compile("learnforge_macos_speech");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=AVFoundation");
        println!("cargo:rustc-link-lib=framework=Speech");
        println!("cargo:rustc-link-lib=framework=Security");
    }
    tauri_build::build()
}
