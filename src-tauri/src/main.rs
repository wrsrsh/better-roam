use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn is_roam(url: &tauri::Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some("roamresearch.com")
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(parsed.scheme(), "https" | "http" | "mailto" | "tel") {
        return Err("Unsupported link type".into());
    }
    std::process::Command::new("/usr/bin/open")
        .arg(parsed.as_str())
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_to_background(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Prohibited)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn show_main(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![hide_to_background, open_external])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Roam", true, Some("CmdOrCtrl+1"))?;
            let hide = MenuItem::with_id(app, "hide", "Close Window", true, Some("CmdOrCtrl+W"))?;
            let background = MenuItem::with_id(
                app,
                "background",
                "Keep Roam in Background",
                true,
                Some("CmdOrCtrl+Q"),
            )?;
            let quit = MenuItem::with_id(
                app,
                "quit-completely",
                "Quit Completely",
                true,
                Some("CmdOrCtrl+Shift+Q"),
            )?;
            let settings =
                MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
            let palette =
                MenuItem::with_id(app, "palette", "Command Palette", true, Some("CmdOrCtrl+K"))?;
            let search = MenuItem::with_id(app, "search", "Search", true, Some("CmdOrCtrl+O"))?;
            let reload = MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
            let app_menu = Submenu::with_items(
                app,
                "Roam Desktop",
                true,
                &[
                    &settings,
                    &show,
                    &hide,
                    &PredefinedMenuItem::separator(app)?,
                    &background,
                    &quit,
                ],
            )?;
            let edit = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;
            let view = Submenu::with_items(app, "View", true, &[&palette, &search, &reload])?;
            app.set_menu(Menu::with_items(app, &[&app_menu, &edit, &view])?)?;
            let popup_app = app.handle().clone();
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("https://roamresearch.com/".parse()?),
            )
            // on_navigation also receives subframe loads on macOS. Intercept
            // user links in controls.js instead, so embeds stay in their frame.
            .on_new_window(move |url, _| {
                if is_roam(&url) {
                    if let Some(window) = popup_app.get_webview_window("main") {
                        let _ = window.navigate(url);
                    }
                } else {
                    let _ = open_external(url.to_string());
                }
                tauri::webview::NewWindowResponse::Deny
            })
            .title("Roam Desktop")
            .inner_size(1280.0, 860.0)
            .min_inner_size(640.0, 420.0)
            .decorations(true)
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
            .initialization_script(include_str!("controls.js"))
            .initialization_script(include_str!("../../adapter/dist/browser.js"))
            .initialization_script(include_str!(concat!(env!("OUT_DIR"), "/theme.js")))
            .build()?;
            // Keep the titled NSWindow style for native corner clipping/shadow,
            // while allowing Roam to fill its entire content area.
            #[cfg(target_os = "macos")]
            unsafe {
                use objc2_app_kit::{NSWindow, NSWindowButton};
                let native = &*(window.ns_window()? as *const NSWindow);
                for kind in [
                    NSWindowButton::CloseButton,
                    NSWindowButton::MiniaturizeButton,
                    NSWindowButton::ZoomButton,
                ] {
                    if let Some(button) = native.standardWindowButton(kind) {
                        button.setHidden(true);
                    }
                }
            }
            let handle = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = hide_to_background(handle.app_handle().clone());
                }
            });
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" | "palette" | "search" => {
                if let Some(window) = app.get_webview_window("main") {
                    // IDs are fixed native menu values, never page-provided code.
                    let _ = window.eval(format!(
                        "window.__roamDesktopAction?.('{}')",
                        event.id().as_ref()
                    ));
                }
            }
            "show" => show_main(app),
            "hide" | "background" => {
                let _ = hide_to_background(app.clone());
            }
            "quit-completely" => app.exit(0),
            "reload" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.reload();
                }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("Unable to start Roam Desktop");
    app.run(|app, event| {
        if let tauri::RunEvent::Reopen { .. } = event {
            show_main(app);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_exact_roam_https_origin_stays_inside() {
        for (url, expected) in [
            ("https://roamresearch.com/#/app/example", true),
            ("https://roamresearch.com.evil.example/", false),
            ("https://roamresearch.com@evil.example/", false),
            ("http://roamresearch.com/", false),
            ("https://example.com/", false),
        ] {
            assert_eq!(is_roam(&url.parse().unwrap()), expected, "{url}");
        }
    }
}
