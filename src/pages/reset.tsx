import { useState } from "react";
import { Box, Button, Container, Flex, Heading, Text, Callout } from "@radix-ui/themes";

export default function ResetPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleReset = async () => {
    if (!confirm("Are you sure you want to delete ALL game data from Redis? This cannot be undone.")) {
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/reset", {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok) {
        setResult({
          success: true,
          message: data.message || "Redis cleared successfully",
        });
      } else {
        setResult({
          success: false,
          message: data.error || "Failed to clear Redis",
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size="2" style={{ paddingTop: "4rem" }}>
      <Flex direction="column" gap="4">
        <Box>
          <Heading size="8" mb="2">
            Reset Database
          </Heading>
          <Text size="3" color="gray">
            Clear all game data from Redis
          </Text>
        </Box>

        <Box
          style={{
            padding: "2rem",
            border: "1px solid var(--gray-6)",
            borderRadius: "var(--radius-3)",
            backgroundColor: "var(--gray-2)",
          }}
        >
          <Flex direction="column" gap="3">
            <Text size="2" color="gray">
              This will permanently delete all games, players, and turns from the Redis database.
              This action cannot be undone.
            </Text>

            <Button
              size="3"
              color="red"
              onClick={handleReset}
              disabled={loading}
              style={{ cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "Clearing..." : "Clear All Redis Keys"}
            </Button>
          </Flex>
        </Box>

        {result && (
          <Callout.Root color={result.success ? "green" : "red"}>
            <Callout.Text>{result.message}</Callout.Text>
          </Callout.Root>
        )}

        <Box>
          <Text size="2" color="gray">
            Use this page during development to quickly reset the database state.
          </Text>
        </Box>
      </Flex>
    </Container>
  );
}
