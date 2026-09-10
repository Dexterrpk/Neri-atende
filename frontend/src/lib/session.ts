// Session boundary: auth is an httpOnly cookie the backend owns; the frontend's one
// duty is wiping the react-query cache so one account's data never renders for the next.
import { apiPost } from "./api";
import { queryClient } from "./queryClient";

// Call after every successful login/signup.
export function beginSession(): void {
  queryClient.clear();
}

// Call from every sign-out control; the hard redirect resets all in-memory state.
export async function endSession(redirectTo: string = "/login"): Promise<void> {
  try {
    await apiPost("/auth/logout");
  } catch {
    // the cookie is cleared client-side regardless; never block sign-out on a failed call
  }
  queryClient.clear();
  window.location.href = redirectTo;
}
