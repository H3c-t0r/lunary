import postgres from "postgres"

const sql = postgres(process.env.DB_URI!, { transform: postgres.camel })

export default sql
