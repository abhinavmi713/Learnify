import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import { BrowserRouter } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";

import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import rootReducer from "./reducer";
import { SocketProvider } from "./context/SocketContext";
import { installSessionHandling } from "./services/apiConnector";
import { setToken } from "./slices/authSlice";
import { setUser } from "./slices/profileSlice";

const store = configureStore({
  reducer: rootReducer,
});

// Keeps the 15-minute access token fresh (see services/apiConnector.js).
let endedNotice = false;
installSessionHandling({
  getToken: () => {
    try {
      return JSON.parse(localStorage.getItem("token") || "null");
    } catch (error) {
      return null;
    }
  },
  onToken: (token) => {
    endedNotice = false;
    localStorage.setItem("token", JSON.stringify(token));
    store.dispatch(setToken(token));
  },
  onSessionEnded: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    store.dispatch(setToken(null));
    store.dispatch(setUser(null));
    if (!endedNotice) toast.error("Your session ended. Please log in again.");
    endedNotice = true;
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <SocketProvider>
        <BrowserRouter>
          <App />
          <Toaster />
        </BrowserRouter>
      </SocketProvider>
    </Provider>
  </React.StrictMode>
);
