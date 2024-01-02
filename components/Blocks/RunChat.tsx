import { useCallback, useMemo, useState } from "react"

import Feedback from "@/components/Blocks/Feedback"
import { BubbleMessage } from "@/components/Blocks/SmartViewer/Message"

import {
  Button,
  Card,
  Group,
  Pagination,
  Stack,
  Text,
  Title,
} from "@mantine/core"
import { useAppUser, useRuns } from "@/utils/dataHooks"
import AppUserAvatar from "./AppUserAvatar"
import { formatDateTime } from "@/utils/format"
import Router from "next/router"
import { IconNeedleThread } from "@tabler/icons-react"

const OUTPUT_ROLES = ["assistant", "ai", "tool"]
const INPUT_ROLES = ["user"]

function parseMessageFromRun(run) {
  function extractMessages(msg, role, siblingOf) {
    if (!msg) return []

    if (Array.isArray(msg)) {
      return msg
        .map((item) => extractMessages(item, role, siblingOf))
        .flat()
        .filter((msg) => msg.content !== undefined)
    }

    return {
      role: msg.role || role,
      content: typeof msg === "string" ? msg : msg.content,
      timestamp: new Date(
        INPUT_ROLES.includes(role) ? run.created_at : run.ended_at,
      ),
      id: run.id,
      feedback: run.feedback,
      ...(siblingOf && { siblingOf }),
      ...(OUTPUT_ROLES.includes(role) && {
        took:
          new Date(run.ended_at).getTime() - new Date(run.created_at).getTime(),
      }),
    }
  }

  return [
    extractMessages(run.input, "user", run.sibling_of),
    extractMessages(run.output, "assistant", run.sibling_of),
  ]
}

// Renders a list of run (or just one)
// As a chat

function RunsChat({ runs }) {
  const [selectedRetries, setSelectedRetries] = useState({})

  // Each chat run has input = [user message], output = [bot message]
  const messages = useMemo(
    () =>
      runs
        ?.map(parseMessageFromRun)
        .flat(2)
        .sort((a, b) => a.timestamp - b.timestamp),
    [runs],
  )

  const getSiblingsOf = useCallback(
    (run) => {
      return runs?.filter((m) => [m.sibling_of, m.id].includes(run.id))
    },
    [runs],
  )

  const handleRetrySelect = (messageId, retryIndex) => {
    setSelectedRetries((prevRetries) => ({
      ...prevRetries,
      [messageId]: retryIndex,
    }))
  }

  return (
    <Stack gap={0}>
      {runs
        ?.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .filter((run) => !run.sibling_of) // Use the main tree as reference
        .map((run, i) => {
          const siblings = getSiblingsOf(run)
          const selectedIndex = selectedRetries[run.id] || 0
          const picked = siblings[selectedIndex]

          return messages
            .filter((m) => m.id === picked.id)
            .map((msg, i) => {
              return (
                <>
                  <BubbleMessage
                    key={i}
                    role={msg.role}
                    content={msg.content}
                    extra={
                      <>
                        {!!msg.took && (
                          <Text c="dimmed" size="xs">
                            {msg.took}ms
                          </Text>
                        )}

                        {msg.role !== "user" && msg.feedback && (
                          <Feedback data={msg.feedback} />
                        )}
                      </>
                    }
                  />

                  {msg.role === "user" && siblings?.length > 1 && (
                    <Pagination
                      gap={1}
                      mx="auto"
                      mb="lg"
                      mt={-6}
                      size="xs"
                      value={selectedIndex + 1}
                      total={siblings.length}
                      onChange={(page) => handleRetrySelect(run.id, page - 1)}
                    />
                  )}
                </>
              )
            })
        })}
    </Stack>
  )
}

export function ChatReplay({ run }) {
  const { runs, loading } = useRuns("chat", {
    match: { parent_run: run.id },
    notInfinite: true,
  })

  const { user } = useAppUser(run.user)

  const sorted = runs?.sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <Stack>
      <Button
        variant="outline"
        ml="auto"
        w="fit-content"
        onClick={() => {
          Router.push(`/traces/${run.id}`)
        }}
        rightSection={<IconNeedleThread size="16" />}
      >
        View trace
      </Button>

      <Card withBorder radius="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Text>User</Text>
            <Text>
              {user ? (
                <AppUserAvatar size="sm" user={user} withName />
              ) : (
                "Unknown"
              )}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text>First message</Text>
            <Text>{formatDateTime(run.created_at)}</Text>
          </Group>
          {sorted?.length && (
            <Group justify="space-between">
              <Text>Last message</Text>
              <Text>
                {formatDateTime(sorted[sorted.length - 1].created_at)}
              </Text>
            </Group>
          )}
        </Stack>
      </Card>

      <Title order={3}>Replay</Title>

      <RunsChat runs={sorted} />
    </Stack>
  )
}

export default RunsChat
