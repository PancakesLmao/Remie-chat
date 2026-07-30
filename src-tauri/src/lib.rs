use tauri::Emitter;
use rdev::{listen, EventType};
use std::thread;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            thread::spawn(move || {
                if let Err(error) = listen(move |event| {
                    if let EventType::KeyPress(_) = event.event_type {
                        let _ = app_handle.emit("global-keypress", ());
                    }
                }) {
                    println!("Error: {:?}", error);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
