import { useEffect } from "react";

function Login() {
    useEffect(() => {
        console.log("Google object:", window.google);
        console.log(
          "Google Client ID:",
          import.meta.env.VITE_GOOGLE_CLIENT_ID
        );
      
        const initializeGoogle = () => {
      if (!window.google) {
        return false;
      }

      const buttonContainer =
        document.getElementById("google-login-button");

      if (!buttonContainer) {
        return true;
      }

      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,

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

    // Google script may load after React.
    if (initializeGoogle()) {
      return;
    }

    const interval = setInterval(() => {
      if (initializeGoogle()) {
        clearInterval(interval);
      }
    }, 100);

    return () => {
      clearInterval(interval);
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