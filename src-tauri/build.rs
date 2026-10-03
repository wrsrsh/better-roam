use std::{env, fs, path::PathBuf};
fn main() {
    let root = PathBuf::from("../vendor/roam-desktop-theme");
    let files = [
        "src/RoamStudio/system/system.css",
        "src/RoamStudio/common/colors.css",
        "src/RoamStudio/common/fixes.css",
        "src/RoamStudio/inline/craft-common.css",
        "src/RoamStudio/inline/craft-auto.css",
        "src/RoamStudio/modules/icons-feather.css",
        "desktop.css",
    ];
    let mut css = String::new();
    for file in files {
        let path = root.join(file);
        println!("cargo:rerun-if-changed={}", path.display());
        css.push_str(
            &fs::read_to_string(path)
                .expect("Missing bundled theme source")
                .replace("@charset \"UTF-8\";", ""),
        );
        css.push('\n');
    }
    let template = "src/theme-template.js";
    println!("cargo:rerun-if-changed={template}");
    let script = fs::read_to_string(template)
        .unwrap()
        .replace("__THEME_CSS__", &serde_json::to_string(&css).unwrap());
    fs::write(
        PathBuf::from(env::var("OUT_DIR").unwrap()).join("theme.js"),
        script,
    )
    .unwrap();
    tauri_build::build()
}
