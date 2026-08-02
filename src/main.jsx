import { render } from "preact";
import App from "./App";

// Tag body so CSS can distinguish settings window from main window
if (new URLSearchParams(window.location.search).get('page') === 'settings') {
  document.body.classList.add('settings-page');
}

render(<App />, document.getElementById("root"));
