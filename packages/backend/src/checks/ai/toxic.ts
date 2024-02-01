import { pipeline } from "@xenova/transformers"

let nerPipeline: any = null
let loading = false

type Output = {
  label: string
  score: number
}[]

async function aiToxicity(sentences?: string[]): Promise<string[]> {
  if (!sentences) return []
  const cleaned = sentences.filter((s) => s && s.length > 3)
  if (!cleaned) return []

  if (!nerPipeline) {
    // this prevents multiple loading of the pipeline simultaneously which causes extreme lag
    if (loading) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      return aiToxicity(sentences)
    }

    loading = true
    nerPipeline = await pipeline("text-classification", "Xenova/toxic-bert")
    loading = false
  }

  const output: Output = await nerPipeline(cleaned, { topk: null })

  return output.filter((l) => l.score > 0.8).map((l) => l.label)
}

export default aiToxicity
