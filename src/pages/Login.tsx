import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      if (!email || !password) {
        setError("Email and password are required");
        return;
      }

      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError("Invalid Admin Credentials");
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      height: "100vh",
      width: "100vw",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#f3f4f6",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      margin: 0,
      overflow: "hidden",
    },
    card: {
      backgroundColor: "white",
      padding: "60px 50px",
      borderRadius: "32px",
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.15)",
      width: "100%",
      maxWidth: "480px",
      textAlign: "center" as const,
    },
    logo: {
      width: "120px",
      height: "120px",
      marginBottom: "20px",
      objectFit: "contain" as const,
    },
    input: {
      width: "100%",
      padding: "18px",
      marginBottom: "16px",
      borderRadius: "16px",
      border: "1.5px solid #e2e8f0",
      fontSize: "16px",
      outline: "none",
      boxSizing: "border-box" as const,
      fontFamily: "inherit",
    },
    button: {
      width: "100%",
      padding: "18px",
      backgroundColor: "#BF40BF",
      color: "white",
      border: "none",
      borderRadius: "16px",
      fontSize: "18px",
      fontWeight: "700",
      cursor: "pointer",
      marginTop: "12px",
      fontFamily: "inherit",
    },
    error: {
      color: "#e11d48",
      backgroundColor: "#fff1f2",
      padding: "12px",
      borderRadius: "12px",
      marginBottom: "15px",
      fontSize: "14px",
      fontWeight: "600",
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        
        {/* ✅ LOCAL LOGO (FAST + RELIABLE) */}
        <img src="/logo.jpg" alt="Logo" style={styles.logo} />

        <h1
          style={{
            fontSize: "32px",
            marginBottom: "6px",
            fontWeight: "800",
            color: "#1e293b",
            letterSpacing: "-0.5px",
          }}
        >
          Admin Portal
        </h1>

        <p
          style={{
            color: "#64748b",
            marginBottom: "40px",
            fontWeight: "500",
          }}
        >
          Authorized personnel only
        </p>

        <input
          style={styles.input}
          placeholder="Email Address"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Password"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <div style={styles.error}>{error}</div>}

        <button
          style={styles.button}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? "Verifying..." : "Sign In"}
        </button>

        <p
          style={{
            marginTop: "40px",
            fontSize: "13px",
            color: "#94a3b8",
            fontWeight: "600",
            letterSpacing: "0.5px",
          }}
        >
         
        </p>
      </div>
    </div>
  );
}