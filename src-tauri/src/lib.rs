#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use rdev::{listen, EventType};
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use std::thread;
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri::Emitter;

mod llm;
// OS handles encryption at rest


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
            llm::stream_openai(
                app,
                event_id,
                api_key,
                model,
                messages,
                temperature,
                max_tokens,
                thinking_enabled,
                &reasoning_effort,
                &user_name,
                &user_bday,
                &local_time,
            )
            .await
        }
        "groq" => {
            llm::stream_groq(
                app,
                event_id,
                api_key,
                model,
                messages,
                temperature,
                max_tokens,
                thinking_enabled,
                &reasoning_effort,
                &user_name,
                &user_bday,
                &local_time,
            )
            .await
        }
        "claude" => {
            llm::stream_claude(
                app,
                event_id,
                api_key,
                model,
                messages,
                temperature,
                max_tokens,
                thinking_enabled,
                &reasoning_effort,
                &user_name,
                &user_bday,
                &local_time,
            )
            .await
        }
        "gemini" => {
            llm::stream_gemini(
                app,
                event_id,
                api_key,
                model,
                messages,
                temperature,
                max_tokens,
                thinking_enabled,
                &user_name,
                &user_bday,
                &local_time,
            )
            .await
        }
        _ => Err(format!("Unknown provider {}", provider)),
    }
}

#[tauri::command]
async fn fetch_models(provider: String, api_key: String) -> Result<Vec<String>, String> {
    llm::fetch_models(provider, api_key).await
}


#[cfg(desktop)]
fn show_main(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

// App entry

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let salt_path = app
                    .path()
                    .app_local_data_dir()
                    .expect("could not resolve app local data path")
                    .join("salt.txt");
                app.handle()
                    .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;
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
                        "settings" => {
                            show_main(app_handle);
                            let _ = app_handle.emit("open-settings", ());
                        }
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
        .invoke_handler(tauri::generate_handler![send_message, fetch_models, exit_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
