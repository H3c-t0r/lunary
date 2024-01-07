import { completeRunUsage } from "@/lib/countTokens"

import sql from "./db"
import { Json } from "@/utils/supaTypes"

export interface Event {
  type:
    | "llm"
    | "chain"
    | "agent"
    | "tool"
    | "log"
    | "embed" // todo: actual support
    | "retriever" // todo: actual support
    | "chat" // deprecated
    | "convo" // deprecated
    | "message"
    | "thread"
  app: string
  event?: string
  level?: string
  runId?: string
  parentRunId?: string
  // convo?: string
  timestamp: string
  input?: any
  tags?: string[]
  name?: string
  output?: any
  message?: string | Json // deprecated (for logs)
  extra?: any
  feedback?: any
  templateId?: string
  metadata?: any
  tokensUsage?: {
    prompt: number
    completion: number
  }
  error?: {
    message: string
    stack?: string
  }
  [key: string]: unknown
}

export const uuidFromSeed = async (seed: string): Promise<string> => {
  const encoder = new TextEncoder()
  const data = encoder.encode(seed)
  const hash = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hash))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  return (
    hashHex.substring(0, 8) +
    "-" +
    hashHex.substring(8, 12) +
    "-" +
    "4" +
    hashHex.substring(13, 16) +
    "-a" +
    hashHex.substring(17, 20) +
    "-" +
    hashHex.substring(20, 32)
  )
}

/* Enabled the user to use any string as run ids.
 * Useful for example for interop with Vercel'AI SDK as they use their own run ids format.
 * This function will convert any string to a valid UUID.
 */
export const ensureIsUUID = async (id: string): Promise<string | undefined> => {
  if (typeof id !== "string") return undefined
  if (!id || id.length === 36) return id // TODO: better UUID check
  else return await uuidFromSeed(id)
}

// Converts snake_case to camelCase
// I found some (probably unintended) camelCase props in the tracer events, so normalize everything
const recursiveToCamel = (item: any): any => {
  if (Array.isArray(item)) {
    return item.map((el: unknown) => recursiveToCamel(el))
  } else if (typeof item === "function" || item !== Object(item)) {
    return item
  }
  return Object.fromEntries(
    Object.entries(item as Record<string, unknown>).map(
      ([key, value]: [string, unknown]) => [
        key.replace(/([-_][a-z])/gi, (c) =>
          c.toUpperCase().replace(/[-_]/g, ""),
        ),
        recursiveToCamel(value),
      ],
    ),
  )
}

export const cleanEvent = async (event: any): Promise<Event> => {
  const { timestamp, runId, parentRunId, tags, name, ...rest } =
    recursiveToCamel(event)

  return {
    ...rest,
    name: typeof name === "string" ? name.replace("models/", "") : undefined,
    tags: typeof tags === "string" ? [tags] : tags,
    tokensUsage: await completeRunUsage(event),
    runId: await ensureIsUUID(runId),
    parentRunId: await ensureIsUUID(parentRunId),
    timestamp: new Date(timestamp).toISOString(),
  }
}

// const message = z.object({
//   id: z
//     .optional(z.string())
//     .transform(async (id) =>
//       id ? await ensureIsUUID(id) : crypto.randomUUID(),
//     ),
//   role: z.string(),
//   isRetry: z.boolean().optional(),
//   text: z.optional(z.string()),
//   timestamp: z.optional(z.date()),
//   extra: z.optional(z.any()),
//   feedback: z.optional(z.any()),
// })

const clearUndefined = (obj: any): any =>
  Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined))

export const ingestChatEvent = async (run: Event): Promise<void> => {
  // create parent thread run if it doesn't exist

  const {
    runId: id,
    app,
    user,
    parentRunId,
    feedback,
    threadTags,
    timestamp,
  } = run

  const { role, isRetry, content, extra } = run.message as any

  const coreMessage = clearUndefined({
    role,
    content,
    extra,
  })

  const [result] = await sql`
    INSERT INTO run (type, id, app, user, tags, input)
    VALUES ('thread', ${parentRunId}, ${app}, ${user}, ${threadTags}, ${JSON.stringify(
      coreMessage,
    )})
    ON CONFLICT (id)
    DO UPDATE SET
      app = EXCLUDED.app,
      user = EXCLUDED.user,
      tags = EXCLUDED.tags,
      input = EXCLUDED.input
    RETURNING *
  `

  if (!result) {
    throw new Error("Error upserting run")
  }

  // Reconciliate messages with runs
  //
  // 1 run can store 1 exchange ([system, user] -> [bot, tool])
  //
  // if previousRun and not retry_of
  //     if this is bot message, then append to previous output's array
  //     if this is user message:
  //         if previous run output has bot then create new run and add to input array
  //         if previous run is user, then append to previous input array
  // else if retry_of
  //     copy previousRun data into new run with new id, set `sibling_of` to previousRun, clear output, then:
  //        if bot message: set output with [message]
  //        if user message: also replace input with [message]
  // else
  //     create new run with either input or output depending on role
  // note; in any case, update the ID to the latest received

  // check if previous run exists. for that, look at the last run of the thread
  const [previousRun] = await sql`
    SELECT * FROM run
    WHERE parent_run = ${parentRunId!}
    ORDER BY created_at DESC
    LIMIT 1`

  const OUTPUT_TYPES = ["assistant", "tool", "bot"]
  const INPUT_TYPES = ["user", "system"] // system is mostly used for giving context about the user

  const shared = {
    id,
    app: run.app,
    ...(run.tags ? { tags: run.tags } : {}),
    ...(run.extra ? { input: run.extra } : {}),
    ...(user ? { user } : {}),
    ...(feedback ? { feedback } : {}),
  }

  let update: any = {} // todo: type
  let operation = "insert"

  if (previousRun) {
    if (isRetry) {
      // copy previousRun data into new run with new id, set `sibling_of` to previousRun, clear output, then:
      // if bot message: set output with [message]
      // if user message: also replace input with [message]
      update = {
        ...previousRun,
        sibling_of: previousRun.id,
        feedback: run.feedback || null, // reset feedback if retry
        output: OUTPUT_TYPES.includes(role) ? [coreMessage] : null,
        input: INPUT_TYPES.includes(role) ? [coreMessage] : previousRun.input,
      }

      operation = "insert"
    } else if (OUTPUT_TYPES.includes(role)) {
      // append coreMessage to output (if if was an array, otherwise create an array)

      update.output = [...(previousRun.output || []), coreMessage]

      operation = "update"
    } else if (INPUT_TYPES.includes(role)) {
      if (previousRun.output) {
        // if last is bot message, create new run with input array

        update.input = [coreMessage]
        operation = "insert"
      } else {
        // append coreMessage to input (if if was an array, otherwise create an array)

        update.input = [...(previousRun.input || []), coreMessage]

        operation = "update"
      }
    }
  } else {
    // create new run with either input or output depending on role
    if (OUTPUT_TYPES.includes(role)) {
      update.output = [coreMessage]
    } else if (INPUT_TYPES.includes(role)) {
      update.input = [coreMessage]
    }
    operation = "insert"
  }

  if (operation === "insert") {
    update.type = "chat"
    update.created_at = timestamp
    update.ended_at = timestamp
    update.parent_run = run.parentRunId

    await sql`
      INSERT INTO run ${sql(
        update,
        "type",
        "created_at",
        "ended_at",
        "parent_run",
      )}
    `
  } else if (operation === "update") {
    update.ended_at = timestamp

    await sql`
      UPDATE run
      SET ${sql(update, "ended_at")}
      WHERE id = ${previousRun.id}
    `
  }
}
