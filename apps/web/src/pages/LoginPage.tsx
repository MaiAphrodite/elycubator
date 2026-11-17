import { useState } from "react";
import {
  TextInput,
  PasswordInput,
  Paper,
  Text,
  Container,
  Button,
  Alert,
} from "@mantine/core";
import { AlertRegular } from "@mingcute/react/core-regular";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { BrandLockup } from "../components/BrandMark";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "register") {
        const reg = await fetch(`${API_BASE}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const regData = await reg.json();
        if (!reg.ok || !regData.success) {
          throw new Error(regData.error || "Registration failed.");
        }
      }

      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Login failed.");
      }

      login(data.data.accessToken, data.data.user);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", backgroundColor: "var(--surface-raised)" }}>
      <Container size={460} my={56} style={{ width: "100%" }}>
        <BrandLockup height={148} />
        <Text c="dimmed" size="md" ta="center" mt="lg">
          {mode === "login"
            ? "Sign in to manage your incubators"
            : "Create an account to pair your incubators"}
        </Text>

        <Paper mt="xl">
          <form onSubmit={handleSubmit}>
            {error && (
              <Alert icon={<AlertRegular size={20} />} title="Kesalahan" color="red" mb="md">
                {error}
              </Alert>
            )}

            {mode === "register" && (
              <TextInput
                label="Nama"
                placeholder="Nama Anda"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            )}

            <TextInput
              label="Email"
              placeholder="you@pinkegg.app"
              required
              mt={mode === "register" ? "md" : undefined}
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />

            <PasswordInput
              label="Kata sandi"
              placeholder={mode === "register" ? "At least 8 characters" : "Kata sandi Anda"}
              required
              mt="md"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />

            <Button fullWidth mt="xl" type="submit" loading={loading}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>

            <Button
              fullWidth
              mt="sm"
              variant="subtle"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
              }}
            >
              {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
            </Button>
          </form>
        </Paper>
      </Container>
    </div>
  );
}
