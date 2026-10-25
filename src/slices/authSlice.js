import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  signupData: null,
  loading: false,
  // Set between the password step and the two-factor code step of login. Kept
  // here (not in the form) because the login page unmounts the form while loading.
  twoFactorChallenge: null,
  token: localStorage.getItem("token") ? JSON.parse(localStorage.getItem("token")) : null,
};

const authSlice = createSlice({
  name: "auth",
  initialState: initialState,
  reducers: {
    setSignupData(state, value) {
      state.signupData = value.payload;
    },
    setLoading(state, value) {
      state.loading = value.payload;
    },
    setToken(state, value) {
      state.token = value.payload;
    },
    setTwoFactorChallenge(state, value) {
      state.twoFactorChallenge = value.payload;
    },
  },
});

export const { setSignupData, setLoading, setToken, setTwoFactorChallenge } = authSlice.actions;

export default authSlice.reducer;
