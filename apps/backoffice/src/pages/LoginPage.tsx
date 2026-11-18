import { Button, Center, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { api, ApiError } from "../api";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/auth/login", { password });
      onLogin();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ההתחברות נכשלה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center mih="100vh" className="cover-fallback" p="md">
      <Paper shadow="xl" p="xl" radius="lg" w={380} maw="100%">
        <form onSubmit={submit}>
          <Stack>
            <div>
              <Text fz={40} ta="center">
                🎉
              </Text>
              <Title order={2} ta="center">
                יוצאים
              </Title>
              <Text c="dimmed" ta="center" fz="sm">
                מערכת ניהול מסיבות, פרסומים וסוכן מכירות
              </Text>
            </div>
            <PasswordInput
              label="סיסמה"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              error={error}
              autoFocus
            />
            <Button type="submit" loading={loading} fullWidth size="md">
              כניסה
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
