/*
 * Ingests events from the client SDKs and stores them in the DB.
 */

import { supabaseAdmin } from "@/lib/supabaseClient"
import { NextRequest } from "next/server"
import cors from "@/lib/api/cors"
import { Json } from "../../utils/supaTypes"
import { Event, cleanEvent, ingestChatEvent } from "@/lib/ingest"
import { edgeWrapper } from "@/lib/api/edgeHelpers"
import { H } from "@highlight-run/next/server"
import { jsonResponse } from "@/lib/api/jsonResponse"

export const runtime = "edge"

const registerRunEvent = async (
  event: Event,
  insertedIds: Set<string>,
  allowRetry = true,
): Promise<void> => {
  let {
    timestamp,
    type,
    app,
    userId,
    templateId,
    userProps,
    event: eventName,
    runId,
    parentRunId,
    input,
    tags,
    output,
    name,
    tokensUsage,
    extra,
    error,
    feedback,
    metadata,
    runtime,
  } = event

  if (!tags) {
    tags = metadata?.tags
  }

  if (!templateId) {
    templateId = metadata?.templateId
  }

  let parentRunIdToUse = parentRunId

  const table = supabaseAdmin.from("run")
  let query = null

  let internalUserId
  // Only do on start event to save on DB calls and have correct lastSeen
  if (typeof userId === "string" && !["end", "error"].includes(eventName!)) {
    const { data } = await supabaseAdmin
      .from("app_user")
      .upsert(
        {
          external_id: userId,
          last_seen: timestamp,
          app: app,
          props: userProps as Json,
        },
        { onConflict: "external_id, app" },
      )
      .select()
      .single()
      .throwOnError()

    internalUserId = data?.id
  }

  if ("start" === eventName && parentRunIdToUse) {
    // Check if parent run exists

    const { data, error } = await supabaseAdmin
      .from("run")
      .select("user")
      .match({ id: parentRunIdToUse })
      .single()

    if (error) {
      // Could be that the parent run is not yet created
      // For example if the server-side event reached here before the frontend event, will throw foreign-key constraint error
      // So we retry once after 5s
      // A cleaner solution would be to use a queue, but this is simpler for now

      console.warn(`Error getting parent run user: ${error.message}`)

      if (allowRetry) {
        console.log(
          "Retrying insertion in 2s in case parent not inserted yet...",
        )

        await new Promise((resolve) => setTimeout(resolve, 2000))

        return await registerRunEvent(event, insertedIds, false)
      } else {
        // Prevent foreign key constraint error
        parentRunIdToUse = undefined
      }
    }

    // This allow user id to correctly cascade to childs runs if for example it's set on the frontend and not passed to the backend
    if (data?.user) {
      internalUserId = data?.user
    }
  }

  switch (eventName) {
    case "start":
      query = table.insert({
        type,
        id: runId,
        user: internalUserId,
        created_at: timestamp,
        app,
        tags,
        name,
        status: "started",
        params: extra,
        template_version_id: templateId,
        parent_run: parentRunIdToUse,
        input,
        runtime,
      })

      break
    case "end":
      // update llm_run with end time, output and status success

      query = table
        .update({
          ended_at: timestamp,
          output,
          status: "success",
          prompt_tokens: tokensUsage?.prompt,
          completion_tokens: tokensUsage?.completion,
        })
        .match({ id: runId })

      break
    case "error":
      query = table
        .update({
          ended_at: timestamp,
          status: "error",
          error,
        })
        .match({ id: runId })

      break
    case "feedback":
      // get previous feedback to merge

      const { data } = await supabaseAdmin
        .from("run")
        .select("feedback")
        .match({ id: runId })
        .maybeSingle()
        .throwOnError()

      query = table
        .update({
          feedback: {
            ...((data?.feedback || {}) as any),
            ...feedback,
            ...extra,
          },
        })
        .eq("id", runId)
      break

    case "chat":
      await ingestChatEvent({
        user: internalUserId,
        ...event,
      })

      break
  }

  if (query) {
    await query.throwOnError()

    insertedIds.add(runId)
  }
}

const registerLogEvent = async (event: Event): Promise<void> => {
  const { event: eventName, app, parentRunId, message, extra } = event

  const { error } = await supabaseAdmin.from("log").insert({
    run: parentRunId,
    app,
    level: eventName,
    message,
    extra: extra || {},
  } as any)

  if (error) throw error
}

const registerEvent = async (
  event: Event,
  insertedIds: Set<string>,
): Promise<void> => {
  const { type } = event

  if (type === "log") {
    await registerLogEvent(event)
    return
  }

  await registerRunEvent(event, insertedIds)
}

export default edgeWrapper(async function handler(req: NextRequest) {
  // export default async function handler(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return cors(req, new Response(null, { status: 200 }))
  }

  const { events } = await req.json()

  // Use to check if parentRunId was already inserted
  const insertedIds = new Set<string>()

  if (!events) {
    console.error("Missing events payload.")
    return cors(req, new Response("Missing events payload.", { status: 400 }))
  }

  // Event processing order is important for foreign key constraints
  const sorted = (Array.isArray(events) ? events : [events]).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )

  const results: {
    id: string
    success: boolean
    error?: string
  }[] = []

  for (const event of sorted) {
    try {
      const cleanedEvent = await cleanEvent(event)

      await registerEvent(cleanedEvent, insertedIds)

      results.push({
        id: event.runId,
        success: true,
      })
    } catch (e: any) {
      console.error(`Error ingesting event: ${e.message}`, { error: e, event })

      H.consumeError(e)

      results.push({
        id: event.runId,
        success: false,
        error: e.message,
      })
    }
  }

  return cors(
    req,
    jsonResponse(200, {
      results,
    }),
  )
})
