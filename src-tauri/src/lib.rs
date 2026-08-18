
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use rdev::{listen, EventType};
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use std::thread;
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

mod llm;
// OS handles encryption at rest

#[tauri::command]
fn open_settings_window(_app: tauri::AppHandle) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(window) = _app.get_webview_window("settings") {
            let _ = window.show();
            let _ = window.set_focus();
        } else {
            let _ = tauri::WebviewWindowBuilder::new(
                &_app,
                "settings",
                tauri::WebviewUrl::App("/?page=settings".into()),
            )
            .title("Remie – Settings")
            .inner_size(600.0, 720.0)
            .resizable(true)
            .visible(true)
            .build();
        }
    }
}

#[tauri::command]
async fn send_message(
    app: tauri::AppHandle,
    provider: String,
    api_key: String,
    model: String,
    messages: Vec<llm::Message>,
    temperature: f32,
    max_tokens: u32,
    thinking_enabled: bool,
    reasoning_effort: String,
    user_name: String,
    user_bday: String,
    local_time: String,
    event_id: String,
) -> Result<(), String> {
    match provider.as_str() {
        "openai" => {
            llm::stream_openai(app, event_id, api_key, model, messages, temperature, max_tokens, thinking_enabled, &reasoning_effort, &user_name, &user_bday, &local_time).await
        }
        "groq" => {
            llm::stream_groq(app, event_id, api_key, model, messages, temperature, max_tokens, thinking_enabled, &reasoning_effort, &user_name, &user_bday, &local_time).await
        }
        "claude" => {
            llm::stream_claude(app, event_id, api_key, model, messages, temperature, max_tokens, thinking_enabled, &reasoning_effort, &user_name, &user_bday, &local_time).await
        }
        "gemini" => {
            llm::stream_gemini(app, event_id, api_key, model, messages, temperature, max_tokens, thinking_enabled, &user_name, &user_bday, &local_time).await
        }
        _ => Err(format!("Unknown provider {}", provider)),
    }
}

#[cfg(desktop)]
fn show_settings(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(desktop)]
fn show_main(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// App entry

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let salt_path = app
                    .path()
                    .app_local_data_dir()
                    .expect("could not resolve app local data path")
                    .join("salt.txt");
                app.handle().plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;
            }
            // ── Tray ──
            #[cfg(desktop)]
            {
                let quit_i = MenuItem::with_id(app, "quit", "Quit app", true, None::<&str>)?;
                let open_i = MenuItem::with_id(app, "open", "Open chat", true, None::<&str>)?;
                let settings_i =
                    MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_i, &settings_i, &quit_i])?;

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("Remie")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app_handle, event| match event.id.as_ref() {
                        "quit" => app_handle.exit(0),
                        "open" => show_main(app_handle),
                        "settings" => show_settings(app_handle),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            // On mobile, close settings window if Tauri instantiated it from tauri.conf.json
            #[cfg(mobile)]
            if let Some(settings_win) = app.get_webview_window("settings") {
                let _ = settings_win.close();
            }

            // On desktop, intercept settings window close — hide instead of destroy
            #[cfg(desktop)]
            if let Some(settings_win) = app.get_webview_window("settings") {
                let win_clone = settings_win.clone();
                settings_win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            // ── Global keyboard hook (existing feature) ──
            #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
            {
                use tauri::Emitter;
                let app_handle = app.handle().clone();
                thread::spawn(move || {
                    if let Err(error) = listen(move |event| {
                        if let EventType::KeyPress(_) = event.event_type {
                            let _ = app_handle.emit("global-keypress", ());
                        }
                    }) {
                        println!("rdev error: {:?}", error);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_settings_window,
            send_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
