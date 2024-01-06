import { Badge, Button, Card, Flex, Group, Stack, Text } from "@mantine/core"
import { useSupabaseClient } from "@supabase/auth-helpers-react"
import {
  IconPencilShare,
  IconWorldShare,
  IconWorldX,
} from "@tabler/icons-react"
import Link from "next/link"
import { useRouter } from "next/router"
import { useEffect, useState } from "react"
import SmartViewer from "./SmartViewer"
import TokensBadge from "./TokensBadge"

const isChatMessages = (obj) => {
  return Array.isArray(obj)
    ? obj.every(isChatMessages)
    : (typeof obj.text === "string" && typeof obj.role === "string") ||
        typeof obj.content === "string"
}

// This is the component that renders the input and output of a run
// It also allow redirecting to the playground or sharing the run

const ParamItem = ({ name, value }) => (
  <Group>
    <Text size="sm">{name}: </Text>
    <Text size="sm">
      {typeof value === "string" || typeof value === "number" ? (
        <Badge variant="outline" style={{ textTransform: "none" }}>
          {value}
        </Badge>
      ) : Array.isArray(value) ? (
        value.map((v) => (
          <Badge
            key={JSON.stringify(v)}
            variant="outline"
            style={{ textTransform: "none" }}
          >
            {v}
          </Badge>
        ))
      ) : (
        JSON.stringify(value)
      )}
    </Text>
  </Group>
)

const PARAMS = {
  temperature: "Temperature",
  max_tokens: "Max tokens",
  top_p: "Top P",
  top_k: "Top K",
  logit_bias: "Logit bias",
  presence_penalty: "Presence penalty",
  frequency_penalty: "Frequency penalty",
  stop: "Stop",
  seed: "Seed",
}

export default function RunInputOutput({
  initialRun,
  withPlayground = true,
  withShare = false,
}) {
  const [run, setRun] = useState(initialRun)
  const [loading, setLoading] = useState(false)
  const supabaseClient = useSupabaseClient()
  const router = useRouter()

  useEffect(() => {
    setRun(initialRun)
  }, [initialRun])

  const canEnablePlayground =
    withPlayground &&
    run?.type === "llm" &&
    run?.input &&
    isChatMessages(run?.input)

  async function makePublic() {
    setLoading(true)
    const { data } = await supabaseClient
      .from("run")
      .update({ isPublic: true })
      .eq("id", run.id)
      .select()
      .single()

    router.push(`/logs/${data.id}`)
    setLoading(false)
  }

  async function makePrivate() {
    setLoading(true)
    const { data } = await supabaseClient
      .from("run")
      .update({ isPublic: false })
      .eq("id", run.id)
      .select()
      .single()
    setRun(data)
    setLoading(false)
  }

  function ShareButton() {
    if (!run.isPublic) {
      return (
        <Button
          onClick={makePublic}
          size="sm"
          variant="light"
          leftSection={<IconWorldShare size={16} />}
          loading={loading}
        >
          Share
        </Button>
      )
    }

    return (
      <Button
        onClick={makePrivate}
        w="130"
        size="sm"
        variant="light"
        leftSection={<IconWorldX size={16} />}
        loading={loading}
        color="red"
      >
        Unshare
      </Button>
    )
  }

  return (
    <Stack>
      {run?.type === "llm" && (
        <>
          {withShare && (
            <Flex justify="right">
              <ShareButton />
            </Flex>
          )}

          <Card withBorder radius="md">
            <Group justify="space-between" align="start">
              <Stack gap="xs">
                <ParamItem name="Model" value={run.name} />

                {Object.entries(PARAMS).map(
                  ([key, name]) =>
                    typeof run.params?.[key] !== "undefined" && (
                      <ParamItem
                        key={name}
                        name={name}
                        value={run.params?.[key]}
                      />
                    ),
                )}
              </Stack>

              {canEnablePlayground && (
                <Stack>
                  <Button
                    variant="outline"
                    size="xs"
                    w="fit-content"
                    display="inline"
                    rightSection={<IconPencilShare size="14" />}
                    component={Link}
                    href={`/prompts/${
                      run.templateVersionId || `?clone=` + run.id
                    }`}
                  >
                    {run.templateVersionId
                      ? "Open template"
                      : "Open in playground"}
                  </Button>
                </Stack>
              )}
            </Group>
          </Card>
        </>
      )}

      <Group justify="space-between">
        <Text fw="bold" size="sm">
          Input
        </Text>
        {run?.promptTokens && <TokensBadge tokens={run.promptTokens} />}
      </Group>

      <SmartViewer data={run?.input} />

      {(run?.output || run?.error) && (
        <>
          <Group justify="space-between">
            <Text fw="bold" size="sm">
              {run.error ? "Error" : "Output"}
            </Text>
            {run.completionTokens && (
              <TokensBadge tokens={run.completionTokens} />
            )}
          </Group>
          <SmartViewer data={run.output} error={run.error} />
        </>
      )}
    </Stack>
  )
}
