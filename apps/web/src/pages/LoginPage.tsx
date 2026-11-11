import { useState } from "react";
import {
  TextInput,
  PasswordInput,
  Paper,
  Title,
  Text,
  Container,
  Button,
  Alert,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", backgroundColor: "#f8f9fa" }}>
      <Container size={420} my={40} style={{ width: "100%" }}>
        <Title ta="center" order={1} fw={900} style={{ color: "#228be6" }}>
          Elycubator
        </Title>
        <Text c="dimmed" size="sm" ta="center" mt={5}>
          {mode === "login"
            ? "Sign in to manage your smart incubators"
            : "Create the account that will own your incubators"}
        </Text>

        <Paper withBorder shadow="md" p={30} mt={30} radius="md">
          <form onSubmit={handleSubmit}>
            {error && (
              <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="md">
                {error}
              </Alert>
            )}

            {mode === "register" && (
              <TextInput
                label="Name"
                placeholder="Your name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            )}

            <TextInput
              label="Email"
              placeholder="mai@elycubator.local"
              required
              mt={mode === "register" ? "md" : undefined}
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />

            <PasswordInput
              label="Password"
              placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
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
