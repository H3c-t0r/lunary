import {
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from "@mantine/core"

import { useForm } from "@mantine/form"
import { useSessionContext, useUser } from "@supabase/auth-helpers-react"
import { IconAnalyze, IconCheck } from "@tabler/icons-react"

import errorHandler from "@/utils/errorHandler"
import { NextSeo } from "next-seo"
import Router from "next/router"
import { useState } from "react"
import { notifications } from "@mantine/notifications"

export default function UpdatePassword() {
  const [loading, setLoading] = useState(false)
  const { supabaseClient } = useSessionContext()

  const form = useForm({
    initialValues: {
      password: "",
    },

    validate: {
      password: (val) =>
        val.length < 5 ? "Password must be at least 5 characters" : null,
    },
  })

  const user = useUser()

  const handlePasswordReset = async ({ password }: { password: string }) => {
    setLoading(true)

    const ok = await errorHandler(supabaseClient.auth.updateUser({ password }))

    notifications.show({
      icon: <IconCheck size={18} />,
      color: "teal",
      title: "Success",
      message: "Password updated successfully",
    })

    if (ok) {
      Router.push("/")
    }

    setLoading(false)
  }

  return (
    <Container py={100} size={600}>
      <NextSeo title="Login" />
      <Stack align="center" gap={50}>
        <Stack align="center">
          <IconAnalyze color={"#206dce"} size={60} />
          <Title order={2} fw={700} size={40} ta="center">
            Reset password
          </Title>
        </Stack>
        <Paper radius="md" p="xl" withBorder miw={350}>
          <Text size="lg" mb="xl" fw={500}>
            Update password
          </Text>

          <form onSubmit={form.onSubmit(handlePasswordReset)}>
            <Stack>
              <PasswordInput
                label="New Password"
                type="password"
                autoComplete="new-password"
                value={form.values.password}
                onChange={(event) =>
                  form.setFieldValue("password", event.currentTarget.value)
                }
                error={form.errors.email && "Invalid password"}
                placeholder="Your email"
              />

              <Button mt="md" type="submit" fullWidth loading={loading}>
                Submit
              </Button>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  )
}
