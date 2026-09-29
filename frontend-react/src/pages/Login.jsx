import { useEffect } from "react";

function Login() {
  useEffect(() => {
    let interval;

    const initializeGoogle = () => {
      if (!window.google) {
        return false;
      }

      const buttonContainer =
        document.getElementById("google-login-button");

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
              "http://localhost:5000/api/auth/google",
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

            const data = await result.json();

            if (!result.ok) {
              throw new Error(
                data.message || "Google login failed"
              );
            }

            console.log("Logged in user:", data.user);

            window.location.href = "/";
          } catch (error) {
            console.error("Login error:", error);
            alert(error.message);
          }
        },
      });

      buttonContainer.innerHTML = "";

      window.google.accounts.id.renderButton(
        buttonContainer,
        {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 300,
      
          
        }
      );

      return true;
    };

    // Try immediately
    if (initializeGoogle()) {
      return;
    }

    // Google script may not have loaded yet
    interval = setInterval(() => {
      if (initializeGoogle()) {
        clearInterval(interval);
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
        ></div>
      </div>
    </div>
  );
}

export default Login;