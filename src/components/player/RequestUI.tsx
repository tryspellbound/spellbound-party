import { useState, useEffect } from "react";
import { Box, Button, Card, Flex, Heading, Text, TextArea } from "@radix-ui/themes";
import type { Request, MultipleChoiceRequest, FreeTextRequest, YesNoRequest, DiceRollRequest } from "@/types/game";

type RequestUIProps = {
  request: Request & { voteCounts?: Record<string, number> };
  gameId: string;
  playerId: string;
  turnNumber: number;
  onSubmit?: () => void;
};

export default function RequestUI({ request, gameId, playerId, turnNumber, onSubmit }: RequestUIProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (response: string) => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/games/${gameId}/requests/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          playerId,
          response,
          turnNumber,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to submit response");
      }

      setSubmitted(true);
      onSubmit?.();
    } catch (err) {
      console.error("Error submitting response:", err);
      setError(err instanceof Error ? err.message : "Failed to submit response");
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card size="4">
        <Flex direction="column" align="center" justify="center" gap="4" style={{ minHeight: "60vh" }}>
          <Text size="8" style={{ fontSize: "4rem" }}>
            ✓
          </Text>
          <Heading size="6">Response Submitted!</Heading>
          <Text color="gray" align="center">
            Waiting for other players...
          </Text>
        </Flex>
      </Card>
    );
  }

  if (request.type === "multiple_choice") {
    return <MultipleChoiceUI request={request as MultipleChoiceRequest & { voteCounts?: Record<string, number> }} onSubmit={handleSubmit} submitting={submitting} error={error} />;
  }

  if (request.type === "free_text") {
    return <FreeTextUI request={request as FreeTextRequest} onSubmit={handleSubmit} submitting={submitting} error={error} />;
  }

  if (request.type === "yes_no") {
    return <YesNoUI request={request as YesNoRequest} onSubmit={handleSubmit} submitting={submitting} error={error} />;
  }

  if (request.type === "dice_roll") {
    return <DiceRollUI request={request as DiceRollRequest} onSubmit={handleSubmit} submitting={submitting} error={error} />;
  }

  return null;
}

function MultipleChoiceUI({
  request,
  onSubmit,
  submitting,
  error,
}: {
  request: MultipleChoiceRequest & { voteCounts?: Record<string, number> };
  onSubmit: (response: string) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  // Calculate leader
  const voteCounts = request.voteCounts || {};
  const maxVotes = Math.max(...Object.values(voteCounts));
  const leader = maxVotes > 0 ? Object.keys(voteCounts).find((choice) => voteCounts[choice] === maxVotes) : null;

  return (
    <Card size="4">
      <Flex direction="column" gap="4" style={{ minHeight: "60vh" }}>
        <Box>
          <Heading size="6" mb="2">
            Vote!
          </Heading>
          <Text size="4" weight="medium">
            {request.question}
          </Text>
        </Box>

        <Flex direction="column" gap="3" style={{ flex: 1 }}>
          {request.choices.map((choice) => {
            const voteCount = voteCounts[choice] || 0;
            const isLeader = choice === leader && maxVotes > 0;

            return (
              <Button
                key={choice}
                size="4"
                variant={selectedChoice === choice ? "solid" : "soft"}
                color={selectedChoice === choice ? "iris" : "gray"}
                onClick={() => setSelectedChoice(choice)}
                disabled={submitting}
                style={{
                  minHeight: "4rem",
                  position: "relative",
                  justifyContent: "flex-start",
                  textAlign: "left",
                }}
              >
                <Flex direction="column" align="start" gap="1" style={{ width: "100%" }}>
                  <Flex justify="between" align="center" style={{ width: "100%" }}>
                    <Text weight="bold" style={{ fontSize: "1.1rem" }}>
                      {choice}
                    </Text>
                    {isLeader && (
                      <Text style={{ fontSize: "1.2rem" }}>✓</Text>
                    )}
                  </Flex>
                  {voteCount > 0 && (
                    <Text size="2" color="gray">
                      {voteCount} {voteCount === 1 ? "vote" : "votes"}
                    </Text>
                  )}
                </Flex>
              </Button>
            );
          })}
        </Flex>

        {error && (
          <Text color="red" size="2">
            {error}
          </Text>
        )}

        <Button
          size="4"
          disabled={!selectedChoice || submitting}
          loading={submitting}
          onClick={() => selectedChoice && onSubmit(selectedChoice)}
        >
          Submit Vote
        </Button>
      </Flex>
    </Card>
  );
}

function FreeTextUI({
  request,
  onSubmit,
  submitting,
  error,
}: {
  request: FreeTextRequest;
  onSubmit: (response: string) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [text, setText] = useState("");

  return (
    <Card size="4">
      <Flex direction="column" gap="4" style={{ minHeight: "60vh" }}>
        <Box>
          <Heading size="6" mb="2">
            Your Input
          </Heading>
          <Text size="4" weight="medium">
            {request.question}
          </Text>
        </Box>

        <TextArea
          size="3"
          placeholder="Type your response..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
          style={{ flex: 1, minHeight: "200px", fontSize: "1rem" }}
        />

        {error && (
          <Text color="red" size="2">
            {error}
          </Text>
        )}

        <Button
          size="4"
          disabled={!text.trim() || submitting}
          loading={submitting}
          onClick={() => onSubmit(text.trim())}
        >
          Submit Response
        </Button>
      </Flex>
    </Card>
  );
}

function YesNoUI({
  request,
  onSubmit,
  submitting,
  error,
}: {
  request: YesNoRequest;
  onSubmit: (response: string) => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <Card size="4">
      <Flex direction="column" gap="4" style={{ minHeight: "60vh" }} justify="center">
        <Box>
          <Heading size="6" mb="2" align="center">
            Quick Decision!
          </Heading>
          <Text size="5" weight="medium" align="center">
            {request.question}
          </Text>
        </Box>

        <Flex direction="row" gap="3">
          <Button
            size="4"
            color="green"
            variant="solid"
            onClick={() => onSubmit("Yes")}
            disabled={submitting}
            style={{ flex: 1, minHeight: "6rem", fontSize: "1.5rem" }}
          >
            Yes
          </Button>
          <Button
            size="4"
            color="red"
            variant="solid"
            onClick={() => onSubmit("No")}
            disabled={submitting}
            style={{ flex: 1, minHeight: "6rem", fontSize: "1.5rem" }}
          >
            No
          </Button>
        </Flex>

        {error && (
          <Text color="red" size="2" align="center">
            {error}
          </Text>
        )}
      </Flex>
    </Card>
  );
}

function DiceRollUI({
  request,
  onSubmit,
  submitting,
  error,
}: {
  request: DiceRollRequest;
  onSubmit: (response: string) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [diceValues, setDiceValues] = useState<number[]>([]);
  const [hasRolled, setHasRolled] = useState(false);

  const rollDice = () => {
    const newValues = Array.from({ length: request.diceCount }, () => Math.floor(Math.random() * 6) + 1);
    setDiceValues(newValues);
    setHasRolled(true);
  };

  const handleSubmit = () => {
    if (diceValues.length > 0) {
      onSubmit(diceValues.join(","));
    }
  };

  const renderDiceFace = (value: number) => {
    const dots: { [key: number]: number[][] } = {
      1: [[1, 1]],
      2: [[0, 0], [2, 2]],
      3: [[0, 0], [1, 1], [2, 2]],
      4: [[0, 0], [0, 2], [2, 0], [2, 2]],
      5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
      6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
    };

    return (
      <Box
        style={{
          width: "100px",
          height: "100px",
          backgroundColor: "white",
          border: "2px solid #333",
          borderRadius: "12px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr 1fr",
          gap: "8px",
          padding: "12px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        }}
      >
        {Array.from({ length: 9 }).map((_, idx) => {
          const row = Math.floor(idx / 3);
          const col = idx % 3;
          const showDot = dots[value]?.some(([r, c]) => r === row && c === col);
          return (
            <div
              key={idx}
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {showDot && (
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    backgroundColor: "#333",
                    borderRadius: "50%",
                  }}
                />
              )}
            </div>
          );
        })}
      </Box>
    );
  };

  return (
    <Card size="4">
      <Flex direction="column" gap="4" style={{ minHeight: "60vh" }} justify="center" align="center">
        <Box>
          <Heading size="6" mb="2" align="center">
            Roll the Dice!
          </Heading>
          <Text size="4" weight="medium" align="center">
            {request.question}
          </Text>
        </Box>

        {hasRolled && diceValues.length > 0 && (
          <Flex gap="3" justify="center" wrap="wrap">
            {diceValues.map((value, idx) => (
              <div key={idx}>{renderDiceFace(value)}</div>
            ))}
          </Flex>
        )}

        {hasRolled && diceValues.length > 0 && (
          <Text size="5" weight="bold">
            Total: {diceValues.reduce((sum, val) => sum + val, 0)}
          </Text>
        )}

        {!hasRolled ? (
          <Button
            size="4"
            onClick={rollDice}
            disabled={submitting}
            style={{ minHeight: "4rem", fontSize: "1.2rem", minWidth: "200px" }}
          >
            Roll {request.diceCount} {request.diceCount === 1 ? "Die" : "Dice"}
          </Button>
        ) : (
          <Flex direction="column" gap="3" align="center" style={{ width: "100%" }}>
            <Button
              size="4"
              variant="soft"
              onClick={rollDice}
              disabled={submitting}
              style={{ minWidth: "200px" }}
            >
              Roll Again
            </Button>
            <Button
              size="4"
              onClick={handleSubmit}
              disabled={submitting}
              loading={submitting}
              style={{ minHeight: "4rem", fontSize: "1.2rem", minWidth: "200px" }}
            >
              Submit Result
            </Button>
          </Flex>
        )}

        {error && (
          <Text color="red" size="2" align="center">
            {error}
          </Text>
        )}
      </Flex>
    </Card>
  );
}
