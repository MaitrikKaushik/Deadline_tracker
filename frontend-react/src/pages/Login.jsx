import { useEffect } from "react";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

function Login() {
  useEffect(() => {
    let interval;

    const initializeGoogle = () => {
      if (!window.google?.accounts?.id) {
        return false;
      }

      const buttonContainer = document.getElementById(
        "google-login-button"
      );

      if (!buttonContainer) {
        return false;
      }

      console.log("Initializing Google Identity Services...");

      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        use_fedcm_for_button: true,

        callback: async (response) => {
          try {
            const result = await fetch(
              `${API_URL}/api/auth/google`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                  credential: response.credential,
                }),
              }
            );

            const contentType =
              result.headers.get("content-type") || "";

            let data = {};

            if (contentType.includes("application/json")) {
              data = await result.json();
            } else {
              const text = await result.text();

              if (text) {
                throw new Error(
                  `Unexpected server response (${result.status}).`
                );
              }
            }

            if (!result.ok) {
              throw new Error(
                data.message || `Google login failed (${result.status}).`
              );
            }

            console.log("Logged in user:", data.user);

            // Preserve shared-cluster links and other URL parameters.
            window.location.href =
              window.location.pathname +
              window.location.search +
              window.location.hash;
          } catch (error) {
            console.error("Login error:", error);
            alert(error.message || "Google login failed. Please try again.");
          }
        },
      });

      buttonContainer.innerHTML = "";

      window.google.accounts.id.renderButton(buttonContainer, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: 300,
      });

      return true;
    };

    // Initialize immediately if Google's script has loaded.
    if (initializeGoogle()) {
      return undefined;
    }

    // Otherwise, wait for the script to load.
    interval = setInterval(() => {
      if (initializeGoogle()) {
        clearInterval(interval);
        interval = undefined;
      }
    }, 100);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="eyebrow">PRODUCTIVITY</p>

        <h1>Deadline Tracker</h1>

        <p className="login-subtitle">
          Sign in to manage your deadlines from anywhere.
        </p>

        <div
          id="google-login-button"
          className="google-login"
        />
      </div>
    </div>
  );
}

export default Login;
